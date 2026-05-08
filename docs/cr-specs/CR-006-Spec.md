---
cr_id: "CR-006"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc:
    - maximize/restore viewport layout toggle via right-click context menu
    - viewport state persistence across layout changes
  must_be_manual: []
---

## Summary

CR-006 adds a maximize/restore feature to the viewport layout, allowing clinicians to focus on a single viewport (axial, sagittal, or coronal) while keeping the navigation and structure panels accessible. The feature is invoked via right-click context menu on any viewport. Maximizing a viewport expands it to fill the image viewing area; restoring returns to the three-pane layout. All other panels (repository, structure inspector, toolbar) remain visible.

## Implementation Plan

### Frontend Changes

1. **UI State (uiStore)**
   - Add `maximizedViewport: "AXIAL" | "SAGITTAL" | "CORONAL" | null` to track which viewport (if any) is maximized
   - Add `toggleMaximizeViewport(viewportId)` action

2. **Viewport Context Menu**
   - Add right-click handler to each viewport panel (axial, sagittal, coronal)
   - Context menu includes "Maximize" option (or "Restore" if already maximized)
   - Clicking the option calls `toggleMaximizeViewport()`

3. **Layout Logic (ImageViewer)**
   - When `maximizedViewport` is set, render the target viewport full-width in the image area
   - When `maximizedViewport` is null, render the standard three-pane grid layout
   - Layout transition should be smooth (CSS flexbox/grid with `transition`)
   - Left sidebar (repository), top operation bar, and right structure panel remain visible and interactive

4. **Keyboard Escape**
   - Pressing Escape while a viewport is maximized restores the three-pane layout (standard UX pattern)

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

| Area | Status | Justification |
|------|--------|---------------|
| Product / UC / CRS | Not required | Existing CRS-001 ("Clinicians shall view CT/MRI images…") already covers multi-plane viewing; this feature adds layout convenience without changing the user requirement or workflow. |
| Architecture / SYSARCH | Not required | No changes to system boundaries, data flow, or repository integration; viewport rendering (Cornerstone3D) is unchanged. Layout is purely client-side state management. |
| Risk / RCM | Not required | This is a cosmetic/convenience feature with no clinical workflow impact, no new hazards, and no safety controls required. |
| SOUP / Dependencies | Not required | No new external libraries or version changes. |

## Verification

**Development Tests:**
- Vitest component tests for context menu rendering and layout toggle logic
- State management tests for `uiStore.maximizedViewport` transitions
- DOM layout verification that maximized viewport fills available space

**Manual Testing:**
- Right-click each viewport and confirm menu appears
- Verify layout transitions smoothly and all panels remain accessible
- Test keyboard Escape to restore from maximized state
- Confirm contour editing, navigation, and toolbar controls work while viewport is maximized

**Regression Check:**
- Full CI pipeline (`dev-frontend`, `dev-api`, `dev-integration` phases) to ensure layout changes do not break existing viewport rendering or DICOM loading

## Implementation Checklist

- [ ] Add `maximizedViewport` state to `uiStore`
- [ ] Implement right-click context menu on viewport elements
- [ ] Implement layout toggle logic in `ImageViewer`
- [ ] Add Escape key handler for restore
- [ ] Write component tests for context menu and layout rendering
- [ ] Write state management tests for `toggleMaximizeViewport()`
- [ ] Manual testing: right-click, maximize, restore, Escape key, contour editing in maximized mode
- [ ] Verify CI pipeline passes
- [ ] No DHF item updates required

## Open Questions

None. This is a straightforward UI enhancement with clear scope and no DHF or architectural impacts.
