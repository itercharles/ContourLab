---
cr_id: "CR-006"
direction_fit: in-scope
affected_items:
  - CRS-012
  - SYS-014
  - SYS-015
  - SRS-028
  - SRS-029
  - SWDD-010
test_plan:
  auto_covered:
    - apps/client/src/core/rendering/threeDGeometry.test.ts
    - apps/client/src/components/viewer/ThreeDViewport.test.tsx
    - apps/client/e2e/crs/three-d-display.spec.ts
  needs_new_tc: []
  must_be_manual:
    - Verify 3D review remains performant with a representative planning CT and multiple visible structures.
---

# CR-006: Add Support For 3D Display

## Summary

Replace the fourth ImageViewer quadrant placeholder with a real 3D review viewport.
The 3D viewport shall display CT-derived spatial context for the active image
series and overlay visible structures from the active structure set as colored
3D surfaces. The viewport shall remain inside the existing contour workspace,
refresh after contour commits and structure visibility changes, and ship with
explicit DHF traceability plus automated test coverage.

## Implementation Plan

### Code Changes

1. **3D rendering stack**
   - Add `@kitware/vtk.js` to `apps/client`
   - Introduce a dedicated 3D scene wrapper that owns vtk renderer, camera, and actor lifecycle
   - Keep vtk objects out of Zustand store state

2. **Fourth quadrant viewer**
   - Replace the 3D placeholder in `ImageViewer.tsx` with `ThreeDViewport`
   - Preserve the current 2x2 clinical workspace layout
   - Add controls for CT show/hide, camera reset, and manual refresh

3. **Contour-to-surface reconstruction**
   - Convert contour world coordinates to voxel coordinates using active volume geometry
   - Rasterize closed contour slices into a cropped binary mask per structure
   - Run marching cubes over the mask to generate a 3D surface
   - Color the resulting actor with the structure RGB value

4. **CT spatial context**
   - Downsample the active CT scalar volume for review-time performance
   - Generate a low-opacity CT review surface using a fixed threshold
   - Keep the CT surface optional through the show/hide control

5. **Refresh behavior**
   - Automatically rebuild the 3D scene after contour commits, contour deletion, structure visibility changes, active structure-set changes, or active series changes
   - Retain a manual refresh action as a recovery path if the automatic rebuild cannot populate a scene

## DHF Impact

- **Clinical requirement**: Add `CRS-012` for synchronized 3D review in the contour workspace
- **System requirements**: Add `SYS-014` for the fourth viewport and `SYS-015` for rebuild behavior
- **Software requirements**: Add `SRS-028` and `SRS-029` for viewport behavior and contour-driven refresh
- **Software design**: Add `SWDD-010` for vtk.js scene management and contour-to-mask reconstruction
- **Risk impact**: No new formal risk item added in this CR; performance validation remains part of verification
- **Test impact**: Required — geometry reconstruction, component behavior, and workspace-level 3D review must be covered by automated tests

## Verification

### Automated Tests
- Run `pnpm --filter @webtps/client test` to validate geometry and component behavior
- Run `pnpm --filter @webtps/client typecheck`
- Run `pnpm --filter @webtps/client lint`
- Run `pnpm --filter @webtps/client test:e2e:crs -- --grep "CRS-012"` for 3D workspace review coverage

### Manual Testing
- Load a representative CT series and confirm the fourth quadrant renders a 3D viewport rather than a placeholder
- Verify CT show/hide and camera reset controls behave correctly
- Draw, modify, and delete a contour in the axial view and confirm the 3D surface refreshes after each committed edit
- Toggle structure visibility and confirm the 3D actor appears or disappears without leaving stale geometry
- Switch active series and confirm the 3D scene rebuilds for the new series

## Test Coverage Requirements

- A pure automated test must verify contour rasterization / mask generation from world-coordinate contour points
- A component test must verify the live 3D viewport state replaces the previous placeholder UI
- An end-to-end clinical test must verify the fourth workspace quadrant exposes 3D review controls and reports CT + structure readiness
- The change is not complete without those automated tests passing in CI
