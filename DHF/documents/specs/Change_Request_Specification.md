# Change Request Specification

**Document Version:** 1.0  
**Generated:** 2026-05-16  
**Project:** DHF Project

---

## Document Control

| Field | Value |
|-------|-------|
| Document ID | CR-SPEC |
| Version | 1.0 |
| Status | DRAFT |
| Last Updated | 2026-05-16 |
| Total Change Requests | 23 |

---

## Purpose

This document provides a comprehensive specification of all Change Requests (CRs) in the system. Each CR tracks proposed changes to the product, including their justification, impact assessment, implementation status, and affected items.

---

## Change Request Summary

### By Status

- **COMPLETED**: 8 change request(s)

### By Priority

- **High**: 5 change request(s)
- **Medium**: 12 change request(s)

---

## Change Requests


### CR-001: The contrast between the text an background is low in the dark mode.

**Status:** CANCELLED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

The contrast between the text an background in the dark mode should be increased.

Source issue: https://github.com/itercharles/WebTPS/issues/10

#### Justification

Low contrast causes difficulties reading text in dark mode.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-002: The contrast between the text an background in the dark mode should be increased.

**Status:** CANCELLED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

The contrast between the text an background in the dark mode should be increased.

Source issue: https://github.com/itercharles/WebTPS/issues/24

#### Justification

Low contrast causes difficulties reading text in dark mode.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-003: The contrast between the text an background in the dark mode should be increased.

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

The contrast between the text an background in the dark mode should be increased.

Source issue: https://github.com/itercharles/WebTPS/issues/42

#### Justification

Low contrast causes difficulties reading text in dark mode.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-004: Add in-app Issues page for submitting and monitoring change requests

**Status:** IMPLEMENTING  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

Add a dedicated /issues page to WebTPS that allows clinical users to submit
bug reports and feature requests directly from the application, and view the
current pipeline stage of all open change requests.

The page includes a submit form (title, description, priority, category) that
creates a GitHub issue via a new API proxy endpoint. Submitted issues feed the
existing issue-to-cr.yml workflow. The status board shows all open issues with
their cr:stage/* label mapped to a human-readable pipeline stage
(Submitted → In Review → Designing → Implementing → Completed).

Source: feat/issues-page PR #44


#### Justification

Clinical users have no in-app mechanism to report issues or track the status of change requests. This closes the feedback loop without requiring direct GitHub access.


#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-005: remove this information in the "click me" page

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

**Priority:** medium
**Category:** bug

remove this information from "click me" page - 

"How to get access

GitHub issue creation requires repository write access. If you do not have access, send your GitHub username to Charles Chen to be added as a collaborator."

as the system has already provide a different approach to create it.

Source issue: https://github.com/itercharles/WebTPS/issues/46

#### Justification

Maintainer assigned this issue to the active release milestone, indicating it is accepted for CR intake.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-006: maximum a certain view

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

**Priority:** medium
**Category:** enhancement

User shall be to maximize a view when he right click and select the "full screen" in the right menu. User can maximize the transverse or any other views.  Maximize means this view occupies all the view display area, but all the other panel still there.

Source issue: https://github.com/itercharles/WebTPS/issues/51

#### Justification

Maintainer assigned this issue to the active release milestone, indicating it is accepted for CR intake.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-007: Contouring functions are not avaliable.

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

**Priority:** critical
**Category:** bug

Drawing features such as Brush, freehand, is not available:
Click the button is not functioning.
The mouse icon keeps the previous functions.
This happens on the auto deployed environment, the local environment looks OK.

Source issue: https://github.com/itercharles/WebTPS/issues/55

#### Justification

Maintainer assigned this issue to the active release milestone, indicating it is accepted for CR intake.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-008: Delegate DICOM file import to the Orthanc repository UI

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

**Priority:** medium

**Category:** refactor


The TPS currently handles DICOM file upload itself via
`uploadDicomWebStudies()`, which bundles all selected files into a single
STOW-RS multipart POST. This drops RTSTRUCT files when uploading folders
(the alphabetically-tail file is silently lost) and never inspects
Orthanc's STOW-RS response, so partial failures look like success.


Replace both the **Patient browser → Import DICOM** and **Settings → Import
DICOM Files** controls with a button that opens the configured Orthanc
Explorer UI in a new tab. Orthanc's native upload flow handles RTSTRUCT,
RTPLAN, RTDOSE, drag-drop, batch progress, and per-file failure surfacing.
After upload, the user returns to WebTPS and the worklist auto-refreshes.


Affects:

- SRS-010: revised wording — local DICOM import is delegated to the
  repository UI rather than performed in-app.

- SWDD-006: `uploadDicomWebStudies` removed; new `getOrthancUiUrl` helper
  derives the redirect target from the existing DICOMweb endpoint config.

#### Justification

Eliminates a class of silent-failure bugs (RTSTRUCT drop, unhandled STOW-RS response) by delegating to Orthanc's mature upload flow. Net code deletion in the client.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-009: 3D structure positioning, MPR contours, and patient-load performance

**Status:** IMPLEMENTING  
**Priority:** High  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

**Priority:** high
**Category:** bug

Three connected issues showed up while loading patients with non-axial / non-HFS geometry or with multi-polygon-per-slice structure sets, plus a cold-load performance regression on CTs that ship without WindowCenter / WindowWidth tags.

- 3D structure positioning was wrong on HFP / FFS / FFP CTs (each structure appeared translated from the CT body by a different amount). Root cause: vtk.js's vtkImageMarchingCubes ignores the imageData direction matrix, so each per-structure mask flipped around its own origin while the CT mesh flipped around the volume origin. Folding the per-axis sign into the spacing fed to vtk.js fixes both meshes consistently for axis-aligned (diagonal) direction matrices.

- Sagittal / coronal MPR contours were dropped or fragmented:
* Direction-aware fix replaces the world-axis-aligned voxel arithmetic in `buildMprMaskBoundaryPath`. For HFP scans (K basis = -Z) the previous code produced negative voxel indices and skipped every contour below the top slice.
* K-row ownership window: when the CT mixes 5 mm / 2.5 mm slabs, Cornerstone3D builds a uniform grid at the average spacing (≈ 2.765 mm), so each contour falls on a fractional voxel-K row. Splitting K ownership halfway between consecutive contours fills every row between the structure's first and last slice.
* Slab-level grouping for multi-polygon-per-slice contours (skin trunk + arm at the same Z, lungs left + right). The previous per-contour ownership window collapsed when two contours shared a K, silently dropping one polygon and producing a stripe pattern in S/C views.

- Patient load took 7 s on cold loads of CTs whose DICOMs lack WC / WW tags. Cornerstone3D's setDefaultVolumeVOI fetched the middle slice with ignoreCache and contended with the streaming-volume queue. Defaulting CT to WC=40 / WW=400 (and MR to WC=600 / WW=1500) in our voiLutModule metadata provider sidesteps the slow path entirely. Cold load drops to ~200 ms.

Adaptive structure mask stride and idle-deferred 3D snapshot are part of the same patient-load improvement: they keep the perceived load time well under a second even on the integrated GPU workstation.

Verified on real RTSTRUCTs against BRTO25A20EL (HFP, multi-polygon skin), BRTO25A11EL (cold load with empty WC/WW), and BRTO25A31EL.

#### Justification

Patient load correctness and speed regressions blocking review of HFP / FFS plans. Bundled because the underlying root causes overlap (direction handling, mask construction, Cornerstone3D's default-VOI path).

#### Impact Assessment

Impact assessment pending.

#### Affected Items

- SRS-012
- SRS-028
- SRS-029



#### Traceability




---


### CR-010: Rename "Issues" page to "Change Requests"

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** CharlesChenElekta  
**Assigned To:** Unassigned

#### Description

Many users interpret "Issues" as a bug tracker only. The page accepts bugs, feature requests, and improvement proposals — renaming it to "Change Requests" aligns with IEC 62304 change-control language and removes the ambiguity.

**Affected UI locations:**
- Left sidebar nav item label (currently "Issues")  
- Page heading inside the Issues page

**Expected outcome:** The nav label and page heading read "Change Requests" so users understand all types of requests are welcome.

Source issue: https://github.com/itercharles/WebTPS/issues/63

#### Justification

Maintainer assigned this issue to the active release milestone, indicating it is accepted for CR intake.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-011: remove the "submit or create an issue" in the about page.

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** CharlesChenElekta  
**Assigned To:** Unassigned

#### Description

remove the "submit or create an issue" in the about page as there is already an entrance in the main page.

Source issue: https://github.com/itercharles/WebTPS/issues/68

#### Justification

remove the "submit or create an issue" in the about page as there is already an entrance in the main page.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CR-012: Update the about box

**Status:** COMPLETED  
**Priority:** Medium  
**Requested By:** itercharles  
**Assigned To:** Unassigned

#### Description

the workflow in the about box should be updated, the analyze phase has been removed.

Source issue: https://github.com/itercharles/WebTPS/issues/91

#### Justification

the actual workflow has been changed.

#### Impact Assessment

Impact assessment pending.

#### Affected Items

- CR-012



#### Traceability




---


### CRS-001: Clinicians shall view CT/MRI images in axial, sagittal, and coronal planes

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-002: Clinicians shall draw and edit contours on image slices

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-003: Clinicians shall navigate contour-bearing slices by structure

**Status:** UNKNOWN  
**Priority:** High  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-004: Clinicians shall view automated contour quality warnings for the active structure and structure set

**Status:** UNKNOWN  
**Priority:** High  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-005: Clinicians shall push the active structure set to the DICOM repository

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-006: Clinicians shall load an RTSTRUCT from the DICOM repository into the active workspace

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-007: Clinicians shall compare a repository RTSTRUCT version with the active workspace

**Status:** UNKNOWN  
**Priority:** Medium  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-008: Clinicians shall select a patient and study from the DICOMweb repository browser

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-009: Clinicians shall always see the active patient, image set, structure source, and sync state

**Status:** UNKNOWN  
**Priority:** Critical  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-010: Clinicians shall be able to reach the system and verify it is operational

**Status:** UNKNOWN  
**Priority:** High  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


### CRS-012: Clinicians shall review the active image set and visible structures in a synchronized 3D viewport

**Status:** UNKNOWN  
**Priority:** High  
**Requested By:** Not Specified  
**Assigned To:** Unassigned

#### Description

No description provided.

#### Justification

No justification provided.

#### Impact Assessment

Impact assessment pending.




#### Traceability




---


## Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Author | | | |
| Reviewer | | | |
| Approver | | | |

---

*End of Change Request Specification*