# Software Design Document

---

**Document Metadata**

| Field | Value |
|-------|-------|
| **Document ID** | MODULE-SPEC |
| **Version** | 1.0 |
| **Generated** | 2026-05-16 |
| **Status** | Draft |
| **Project** | DHF Project |

---

## 1. Introduction

This document defines the software module decomposition for DHF Project. Each module entry
describes the unit's responsibility, key interfaces, and internal structure. Detailed design
decisions for individual software requirements within each module are recorded in the
Software Detailed Design Document (SWDD-SPEC).

### 1.1 Design Layer Relationships

| Item type | One per | Links |
|-----------|---------|-------|
| MODULE | Software unit | — |
| SWDD | SRS requirement within a module | `implements` → SRS, `module` → MODULE |

---

## 2. Software Modules

### 1. MODULE-001: StateStore

<div class="requirement-section" markdown="1">

#### Description

Manages all application state using Zustand stores with Immer middleware for
immutable updates. Three stores partition responsibility: volumeStore (loaded
DICOM series, active series UID, loading state), structureStore (structure
sets, structures, contour slices, active structure), and uiStore (active tool,
window/level preset, brush radius, sidebar state, viewport layout).

Stores are accessed via useXxxStore() hooks in React components and via
useXxxStore.getState() in non-React code. Float32Array contour points must not
be mutated through Immer drafts; ContourSlice objects must be replaced entirely.

Interfaces: exposes typed hooks to all React components; receives commands from
ContourEngine and DicomLoader; drives RenderingEngine and PersistenceLayer
through reactive subscriptions.

</div>

### 2. MODULE-002: DicomLoader

<div class="requirement-section" markdown="1">

#### Description

Implements the DICOMweb loading pipeline using QIDO-RS (metadata queries),
WADO-RS (image retrieval), and STOW-RS (import). Responsible for querying
available planning CT series, constructing Cornerstone3D image identifiers,
and managing the patient/study worklist with foreground and background refresh
cadences.

Interfaces: queries the DICOMweb repository via Vite proxy (/dicom-web →
Orthanc); writes loaded series and metadata into volumeStore; hands image
identifiers to RenderingEngine for display.

</div>

### 3. MODULE-003: RenderingEngine

<div class="requirement-section" markdown="1">

#### Description

Wraps Cornerstone3D to manage 2D and 3D viewports. Responsible for rendering
CT image stacks, keeping contour overlays registered during pan/zoom/scroll
transforms, and reconstructing 3D surface geometry from contour slices using
marching squares / surface reconstruction.

Interfaces: receives image identifiers from DicomLoader; reads contour data
from structureStore; renders into React-owned canvas elements; exposes viewport
event callbacks (right-click, crosshair sync) to ViewportUI.

</div>

### 4. MODULE-004: ContourEngine

<div class="requirement-section" markdown="1">

#### Description

Owns contour editing logic and undo/redo history. ContourEngine processes user
drawing input and applies contour changes to structureStore via the command
pattern (UndoRedoManager). UndoRedoManager maintains a 50-level command stack;
new push() clears the redo stack; overflow evicts the oldest entry.

Interfaces: receives pointer events from RenderingEngine canvas; writes contour
mutations to structureStore; exposes undo()/redo() to the toolbar; triggers
PersistenceLayer auto-save on each committed edit.

</div>

### 5. MODULE-005: PersistenceLayer

<div class="requirement-section" markdown="1">

#### Description

Handles durable storage and DICOM exchange for structure data. Responsible for
auto-saving structure drafts to browser localStorage keyed by series UID,
loading drafts on study open, exchanging complete structure sets with the DICOM
repository as RTSTRUCT objects via STOW-RS and WADO-RS, and detecting version
divergence between the active workspace and the repository copy.

Interfaces: reads structureStore for the current workspace state; writes to
localStorage and the DICOMweb repository; surfaces quality and version-diff
summaries to the UI via structureStore.

</div>

### 6. MODULE-006: ApiBackend

<div class="requirement-section" markdown="1">

#### Description

ASP.NET Core 10 Web API serving as the application backend. Currently exposes
a health endpoint and provides the extension point for server-side features.
Runs on port 4000; the Vite dev server proxies /api to this process.

Interfaces: HTTP REST API consumed by the React client; no direct dependency
on the DICOM repository (all DICOMweb calls are client-to-Orthanc via proxy).

</div>

### 7. MODULE-007: StructureUtilities

<div class="requirement-section" markdown="1">

#### Description

Stateless utility functions for structure data computation. Provides TG-263
structure type inference from name strings (prefix/suffix matching against the
TG-263 standard) and structure volume calculation using the shoelace formula
applied per-slice with slice thickness integration.

Interfaces: pure functions with no side effects; called by PersistenceLayer
for quality summaries and by the UI for display metadata.

</div>

### 8. MODULE-008: ViewportUI

<div class="requirement-section" markdown="1">

#### Description

Manages viewport layout state and UI controls overlaid on the rendering canvas.
Responsible for the maximize/restore viewport feature (toggling between
three-pane grid and single-viewport fullscreen), context menu rendering on
right-click, and keyboard shortcuts (Escape to restore layout).

Interfaces: reads and writes uiStore.maximizedViewport; listens to
RenderingEngine canvas events (onContextMenu); resets layout on patient change.

</div>

### 9. MODULE-009: CIPipeline

<div class="requirement-section" markdown="1">

#### Description

GitHub Actions workflow configuration for build, test, and deployment
automation. Implements the multi-phase CI pipeline: development builds
(frontend lint/typecheck, API build, shared-types), verification testing
(Vitest SRS tests, Playwright system tests), validation testing (clinical
workflow tests), compliance gate (requirement coverage), and deployment to
self-hosted workstation via Docker.

Interfaces: triggered by GitHub pull request and push events; reads from
the DHF repository for compliance checks; writes evidence bundles and
deployment artifacts.

</div>


---

## 3. Summary

| Metric | Count |
|--------|-------|
| **Total Modules** | 9 |

---

## 4. Document Control

**Document Owner**: Engineering Lead
**Last Updated**: 2026-05-16
**Next Review**: TBD

---

*This document was automatically generated by MedHarness.*