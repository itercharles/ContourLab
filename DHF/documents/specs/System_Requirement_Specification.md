# System Requirement Specification

---

**Document Metadata**

| Field | Value |
|-------|-------|
| **Document ID** | SYS-SPEC |
| **Version** | 1.0 |
| **Generated** | 2026-05-16 |
| **Status** | Draft |
| **Project** | DHF Project |

---

## 1. Introduction

This document specifies the System Requirement for DHF Project, in accordance with
IEC 62304:2006+AMD1:2015. It forms part of the Design History File (DHF) and provides
traceability for regulatory compliance.

### 1.1 Requirements Traceability Chain

All requirements in DHF Project are structured in a traceable hierarchy:

```
UC (Use Cases)
 └── CRS (Customer Requirements)
      └── SYS (System Requirements)
           └── SRS (Software Requirements)
                └── SWDD (Software Detailed Design)
                     └── SWTEST (Verification / Validation Tests)
```

Each item at one level derives from one or more items at the level above.

---

## 2. System Requirement Items

### 1. SYS-001: System shall load DICOM CT series from a DICOMweb repository

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall query a DICOMweb-compatible repository for available
planning CT image series, excluding non-planning modalities and CBCT-like
acquisition series from the primary worklist, retrieve series instance
metadata, and assemble the selected series into a 3D volume with correct
slice ordering, pixel spacing, and image position patient metadata. The
viewer shall use DICOMweb as the primary image acquisition mechanism rather
than directly opening local image files in the browser.

**Satisfies:** CRS-001

</div>

---
### 2. SYS-002: System shall render axial, sagittal, and coronal viewports simultaneously

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
Using Cornerstone3D, the system shall render three synchronized orthogonal
viewports. Scrolling in one view shall update the crosshair position visible
in all three views. Window/level changes shall apply globally across all
viewports.

**Satisfies:** CRS-001

</div>

---
### 3. SYS-003: System shall support creating, editing, and deleting structures in a structure set

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test  
The system shall allow users to create structures with TG-263-compliant names,
assign types (GTV/CTV/PTV/OAR/EXTERNAL/AVOIDANCE/SUPPORT), set RGB colors,
and toggle visibility. Volume in cm3 shall be computed from contour data.

**Satisfies:** CRS-002

</div>

---
### 4. SYS-004: System shall provide freehand, polygon, brush, and eraser contouring tools

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall provide contouring tools operating on the active viewport.
Freehand and polygon tools produce closed ContourSlice polygons. Brush and
eraser tools provide per-slice contour correction operations compatible with
the stored ContourSlice representation. All edits shall be undoable up to 50
levels via Cmd/Ctrl+Z.

**Satisfies:** CRS-002

</div>

---
### 5. SYS-005: System shall preserve editable structure drafts in browser-local storage

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall automatically serialize and store editable structure draft
data in browser-local storage keyed by SeriesInstanceUID after each edit that
marks the series dirty. When the same series is loaded and no in-memory
structure data exists, the system shall attempt to restore the local draft.
Routine draft saving shall not require ContourLab backend persistence.

**Satisfies:** CRS-002

</div>

---
### 6. SYS-006: System shall upload the active structure set to the DICOM repository as RTSTRUCT

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall convert the active in-memory structure set for the active
image series into a conformant DICOM RT Structure Set object, preserving
study, series, frame-of-reference, and referenced SOP instance metadata, and
upload the object to the connected DICOMweb repository using STOW-RS. Push
Changes shall be available only when unsynchronized local changes exist.
After successful upload the system shall associate the structure set with the
new SOP Instance UID, clear the unsynchronized-changes state, and reflect the
new object as the active repository source.

**Satisfies:** CRS-005

</div>

---
### 7. SYS-007: System shall retrieve and load RTSTRUCT objects from the DICOM repository

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall query the connected DICOMweb repository for RT Structure Set
objects associated with the active patient study, present candidates in
newest-first order under the corresponding image-set context, and load a
user-selected object by activating the matching image series and replacing the
active in-memory structure set. The loaded object shall be marked as the
active repository source.

**Satisfies:** CRS-006

</div>

---
### 8. SYS-008: System shall compare a repository RTSTRUCT version with the active workspace

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall allow a repository RTSTRUCT object to be compared with the
active workspace structure set for the same image set without replacing the
active workspace. The comparison shall identify added, removed, and changed
ROI names and shall report contour-bearing slice-count and volume deltas where
available. The result shall be visible inline in the repository review
workflow.

**Satisfies:** CRS-007

</div>

---
### 9. SYS-009: System shall provide structure contour review navigation

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall allow the user to navigate between contour-bearing slices for
the active structure using previous and next controls, targeting the axial
viewport and wrapping at the first or last contour slice. The structure list
shall show contour slice count, volume, hidden/locked state, and an indicator
when the active slice has a contour for each structure.

**Satisfies:** CRS-003

</div>

---
### 10. SYS-010: System shall compute and display contour quality analysis for structures

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  **Critical Safety**: Yes  
The system shall analyze the active structure's contour geometry and report
quality issues including open contours, degenerate contours with insufficient
area, slice gaps larger than expected image spacing, abrupt adjacent-slice
area or centroid changes, and contours outside the active image bounds. The
system shall also aggregate quality issues across all structures into an RTSS
QA checklist. Selecting a checklist item shall activate the corresponding
structure and navigate to the relevant image slice.

**Satisfies:** CRS-004

</div>

---
### 11. SYS-011: System shall provide patient and study selection from the DICOMweb repository

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall present a patient browser showing available patients from the
connected DICOMweb repository with name, MRN, study context, last activity,
and active-patient indication. The browser shall support search and filter by
clinical identifiers. Selecting a patient shall automatically activate the
newest planning CT series and retrieve the newest matching RTSTRUCT when one
is available.

**Satisfies:** CRS-008

</div>

---
### 12. SYS-012: System shall display persistent workspace context

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall continuously display the active patient, active image series,
active RTSTRUCT or structure set source, and repository synchronization state
in the top operation bar throughout all clinical workflow interactions. The
display shall update immediately when any of these context values change.

**Satisfies:** CRS-009

</div>

---
### 13. SYS-013: System shall expose a health status endpoint for operational monitoring

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test  
The system shall provide a health status interface that allows operators,
CI pipelines, and local development tools to verify that the application
services are running and reachable without requiring clinical authentication.
The health response shall include at minimum the service name and a status
indicator.

**Satisfies:** CRS-010

</div>

---
### 14. SYS-014: System shall render a fourth 3D viewport for the active image set

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall dedicate the fourth workspace quadrant to a 3D viewport for
the active image set. The 3D viewport shall present CT-derived spatial
context together with the currently visible structures from the active
structure set and shall support rotate, pan, zoom, and camera reset
interactions without replacing the existing axial, sagittal, and coronal
viewports.

**Satisfies:** CRS-012

</div>

---
### 15. SYS-015: System shall refresh 3D structure presentation after contour and visibility updates

<div class="requirement-section" markdown="1">

**Category**: Functional  **Verification Method**: Test, Demonstration  
The system shall refresh the 3D representation of visible structures after a
contour add, contour update, contour delete, structure visibility toggle,
structure-set switch, or active-series switch. The refreshed 3D presentation
shall remain aligned to the active image set and shall provide a manual
refresh path when automatic rebuilding cannot complete.

**Satisfies:** CRS-012

</div>

---
### 16. SYSARCH-001: Browser Client

<div class="requirement-section" markdown="1">

**Status**: <span class="status-approved">APPROVED</span>  
The primary software item running in the clinical user's browser. Responsible for
all user interaction, DICOM rendering, contouring workflow, and local state management.

Technology stack:
- React 18 + TypeScript (strict) + Vite — component framework and build tooling
- Cornerstone3D — GPU-accelerated DICOM rendering via WebGL (axial/sagittal/coronal MPR)
- Zustand + Immer — reactive state management (volumeStore, structureStore, uiStore)
- Tailwind CSS — dark clinical UI theme

Key sub-components:
- ViewportManager: manages Cornerstone3D rendering contexts and MPR layout
- MPRController: coordinates multi-planar reconstruction across viewports
- ContourEngine: freehand, polygon, brush, and eraser contouring tools; undo/redo
- DICOMweb client: QIDO-RS (query), WADO-RS (retrieve), STOW-RS (store) via /dicom-web proxy
- IndexedDB adapter: browser-local auto-save of in-progress structure set drafts

External interfaces:
- /dicom-web/* → Orthanc DICOMweb (proxied by Vite in dev, reverse proxy in prod)
- /api/* → ASP.NET Core API (proxied by Vite in dev)
- /ws → WebSocket for real-time updates (proxied)

Data flows:
- Image loading: QIDO-RS query → WADO-RS metadata → Cornerstone image IDs →
  VolumeBuilder → Cornerstone3D volume → ViewportManager.setVolume() → GPU render
- Contouring: user gesture → ContourEngine.addContour() → UndoRedoManager →
  structureStore → React re-render
- Draft persistence: structureStore dirty → IndexedDB auto-save → restore on reload
- Structure upload: active RTSTRUCT → STOW-RS to DICOM repository


</div>

---
### 17. SYSARCH-002: DICOMweb Repository Interface

<div class="requirement-section" markdown="1">

**Status**: <span class="status-approved">APPROVED</span>  
External DICOMweb-compatible storage system providing DICOM object persistence
and query capabilities. Accessed by the browser client directly via the /dicom-web
reverse proxy path.

Development environment: Orthanc (Docker, no authentication, port 8042)
Production environment: Hospital PACS or VNA with DICOMweb support

Exposed DICOMweb services:
- QIDO-RS: query studies, series, and instances by DICOM attributes
- WADO-RS: retrieve DICOM objects (bulk data, metadata, rendered frames)
- STOW-RS: store DICOM objects (CT series metadata, RTSTRUCT uploads)

Configuration:
- Dev: Vite proxies /dicom-web → http://localhost:8042 (no auth)
- Prod: reverse proxy to hospital PACS/VNA (auth configured per deployment)

The repository is the system of record for all patient imaging data and
finalized structure sets. It is not owned or operated by ContourLab.


</div>

---
### 18. SYSARCH-003: ASP.NET Core API

<div class="requirement-section" markdown="1">

**Status**: <span class="status-approved">APPROVED</span>  
Thin HTTP gateway providing the server-side boundary of the ContourLab system.
Built with ASP.NET Core 10 (C#), running on port 4000.

Current responsibilities:
- Health endpoint (/api/health) for infrastructure smoke checks and CI validation
- Future: plan storage, user session management, compute orchestration

External interfaces:
- HTTP REST on port 4000 (proxied via Vite /api in dev)
- WebSocket on port 4000 (proxied via Vite /ws in dev)

The API intentionally does not process DICOM data directly in Phase 1. DICOM
operations are performed by the browser client via direct DICOMweb calls to the
repository. The API will take on a larger role in Phase C (Planning) when
server-side dose computation and optimization are introduced.

Build: dotnet build apps/api/api.csproj --configuration Release


</div>

---

## 3. Summary

| Metric | Count |
|--------|-------|
| **Total Items** | 18 |
| **Approved** | 3 |
| **Draft** | 0 |
| **Retired** | 0 |

---

## 4. Document Control

**Standard**: IEC 62304:2006+AMD1:2015
**Last Updated**: 2026-05-16

---

*Generated from DHF items in DHF Project.*