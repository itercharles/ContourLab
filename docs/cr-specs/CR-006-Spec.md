---
cr_id: "CR-006"
direction_fit: in-scope
affected_items: []
test_plan:
  auto_covered: []
  needs_new_tc: []
  must_be_manual:
    - Right-click context menu display on viewport
    - View maximization and restoration
---

# CR-006: Maximize a View

## Summary

Enable users to right-click on a view (Axial, Sagittal, or Coronal) and select "Full Screen" from a context menu. When a view is maximized, it occupies the entire DICOM viewer area while all other panels (left sidebar, right sidebar, toolbar, status bar) remain visible. Users can restore the normal multi-view layout by clicking an exit button or right-clicking and selecting the restore option.

## Implementation Plan

### 1. State Management (uiStore)

**File: `apps/client/src/core/store/uiStore.ts`**

Add new state properties and actions:
- `maximizedViewport: ViewportOrientation | null` — tracks which viewport (if any) is maximized; `null` means normal layout
- `setMaximizedViewport: (v: ViewportOrientation | null) => void` — setter for maximized state
- `clearMaximizedViewport: () => void` — convenience method to restore normal layout

### 2. Viewport Context Menu

**File: `apps/client/src/components/viewer/ImageViewer.tsx`**

Modify `ViewportPanel` component:
- Add `onContextMenu` handler to the viewport div (line 77–97)
- Prevent default browser context menu (`event.preventDefault()`)
- Call a function `handleViewportContextMenu(orientation)` that displays a custom context menu at the mouse position
- Render a floating context menu with two options:
  - **"Full Screen"** (or "Maximize") — call `setMaximizedViewport(orientation)`
  - **"Restore"** (shown only when that viewport is already maximized) — call `clearMaximizedViewport()`

### 3. Grid Layout Logic

**File: `apps/client/src/components/viewer/ImageViewer.tsx`**

In the main `ImageViewer` return, conditionally change the grid layout based on `maximizedViewport`:
- **Normal layout** (maximizedViewport is null): 
  ```tsx
  <div className="grid h-full grid-cols-2 grid-rows-2 gap-[1px]">
    {/* 4 panels: Axial, Sagittal, Coronal, 3D placeholder */}
  </div>
  ```
- **Maximized layout** (maximizedViewport is set):
  ```tsx
  <div className="h-full">
    {/* Only the maximized viewport fills the area */}
    {maximizedViewport === 'AXIAL' && <ViewportPanel ... />}
    {maximizedViewport === 'SAGITTAL' && <ViewportPanel ... />}
    {maximizedViewport === 'CORONAL' && <ViewportPanel ... />}
    
    {/* Exit button (top-right corner) */}
    <button className="...">↙ Restore</button>
  </div>
  ```

### 4. Exit/Restore Button

Add a small button in the top-right corner of the maximized viewport:
- Text: "↙ Restore" or "Exit Full Screen" (concise, clickable)
- Position: `absolute top-2 right-2 z-20` (above viewport overlay content)
- Style: Tailwind button with hover state
- Functionality: Calls `clearMaximizedViewport()` on click
- Accessibility: cursor pointer, suitable color contrast

Alternatively, users can right-click and select "Restore" from the context menu.

### 5. Context Menu Component

Create a simple floating context menu (no new file needed if inline is acceptable, or extract `ViewportContextMenu.tsx`):
- Position: rendered at `event.clientX, event.clientY` (with bounds checking to stay within viewport)
- Click outside or press Escape to dismiss
- Single selection triggers action and closes menu
- Minimal styling: dark background, light text, rounded corners, pointer cursor

### 6. No Changes to Other Panels

- Left sidebar, right sidebar, toolbar, status bar remain unaffected
- ResizeObserver already handles viewport resizing; this continues to work when layout changes

## DHF Impact

- **Product Impact**: Not required — adds a UI control for existing views without changing clinical workflow or use cases
- **Requirements Impact**: Not required — no new functional requirements; this is a UI enhancement to existing views
- **Architecture Impact**: Not required — no architectural changes; state management and component structure remain the same
- **Risk Impact**: Not required — no new clinical risk; rightclick menu is a standard UI pattern
- **SOUP Impact**: Not required — no new dependencies
- **Test Impact**: Required — add component tests for context menu display, viewport maximization/restoration, and exit button functionality

## Verification

### Automated Tests

1. **ViewportPanel context menu tests** (`apps/client/src/components/viewer/ImageViewer.test.tsx`):
   - Test that right-click on a viewport renders the context menu
   - Test that clicking "Full Screen" calls `setMaximizedViewport` with the correct orientation
   - Test that clicking "Restore" calls `clearMaximizedViewport`
   - Test that context menu is dismissed on click outside or Escape key
   - Test that only one option ("Restore") is shown when viewport is already maximized

2. **ImageViewer layout tests**:
   - Test that grid layout renders normally when `maximizedViewport` is null
   - Test that only the maximized viewport renders when `maximizedViewport` is set
   - Test that exit button is rendered in maximized mode and not in normal mode
   - Test that clicking exit button restores normal layout

3. **UIStore tests**:
   - Test that `setMaximizedViewport` updates state correctly
   - Test that `clearMaximizedViewport` resets state to null

**Run**: `pnpm --filter @webtps/client test` and verify all tests pass

### Manual Testing

1. **Context menu display**:
   - Load a DICOM series
   - Right-click on the Axial viewport
   - Verify a context menu appears with "Full Screen" and "Restore" options (or only "Full Screen" if not yet maximized)
   - Right-click on Sagittal and Coronal; verify menu appears for each

2. **View maximization**:
   - Right-click Axial and select "Full Screen"
   - Verify Axial fills the entire viewer area
   - Verify left sidebar, right sidebar, toolbar, and status bar are still visible
   - Verify other views (Sagittal, Coronal, 3D) are hidden
   - Verify an exit button is visible (top-right corner)

3. **Restore via button**:
   - Click the exit/restore button
   - Verify the normal 2×2 grid layout is restored
   - Verify all four panels (Axial, Sagittal, Coronal, 3D) are visible again

4. **Restore via menu**:
   - Maximize Coronal
   - Right-click the maximized viewport
   - Verify the context menu shows "Restore" option
   - Click "Restore"
   - Verify normal layout is restored

5. **Switch between maximized views**:
   - Maximize Axial, then without exiting, right-click and select "Full Screen" on Sagittal
   - Verify the layout changes to show Sagittal instead (no flickering)

6. **Regression testing**:
   - Verify normal 2×2 layout is unchanged when no viewport is maximized
   - Verify zoom, pan, scroll, and other viewer tools work in maximized mode
   - Verify window level presets apply correctly in maximized view
   - Verify crosshairs are rendered correctly in maximized view

## Implementation Checklist

- [ ] Add `maximizedViewport` state and actions to uiStore
- [ ] Implement `onContextMenu` handler in ViewportPanel
- [ ] Create ViewportContextMenu floating component (inline or separate file)
- [ ] Update ImageViewer grid layout to conditionally render maximized or normal view
- [ ] Add exit/restore button with click handler
- [ ] Style context menu and button per dark clinical theme (no inline styles, Tailwind only)
- [ ] Write component tests for context menu, layout switching, and exit button
- [ ] Write uiStore tests for maximize/restore state transitions
- [ ] Manual test: context menu appears on all viewports
- [ ] Manual test: maximization hides other viewports and shows exit button
- [ ] Manual test: restoration via button and context menu works
- [ ] Manual test: no regressions in viewer tools, zoom, pan, scroll in maximized mode
- [ ] Run `pnpm --filter @webtps/client lint && pnpm --filter @webtps/client typecheck && pnpm --filter @webtps/client test`

## Open Questions

None. The feature scope is clear: right-click context menu for maximize/restore on each viewport, with visual feedback and easy exit.
