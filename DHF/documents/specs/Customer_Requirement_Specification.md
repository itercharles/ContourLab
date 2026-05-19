# Customer Requirement Specification

---

**Document Metadata**

| Field | Value |
|-------|-------|
| **Document ID** | CRS-SPEC |
| **Version** | 1.0 |
| **Generated** | 2026-05-16 |
| **Status** | Draft |
| **Project** | DHF Project |

---

## 1. Introduction

This document specifies the Customer Requirements for DHF Project, in accordance with
IEC 62304:2006+AMD1:2015 §5.2. It forms part of the Design History File (DHF) and provides
traceability for regulatory compliance.

Customer requirements capture what clinical users need the system to do, derived from use cases.
They drive the system-level requirements decomposition and are the primary basis for clinical
workflow validation (Test-CRS).

### 1.1 Traceability Position

```
UC (Use Cases)
 └── CRS (Customer Requirements)  ← this document
      └── SYS (System Requirements)
           └── SRS (Software Requirements)
```

---

## 2. Product Context

### 2.1 Product Position

DHF Project is a browser-based radiation therapy planning workspace. The near-term product
is **not** a full TPS replacement. The current focus is a clinical workstation for:

- DICOM repository-backed image access
- RT Structure Set review
- Contour correction and QA
- Repository round-trip for RTSTRUCT publishing

The product remains narrow until the review workflow is operationally stable.

### 2.2 Intended Users

- Radiation oncologists
- Medical physicists
- Dosimetrists / radiation therapy treatment planners

### 2.3 Intended Environment

Clinical workstation with modern browser (Chrome/Chromium), connected to a hospital
DICOMweb-compatible PACS or DICOM repository.

### 2.4 Current Phase Focus (Phase A — Contouring)

User priorities for this phase:

- Predictable repository-driven loading
- Stable contour display and editing
- Clear active patient / image / RTSS context
- QA visibility and review ergonomics
- Trustworthy save / push behavior

### 2.5 Explicitly Deferred

The following are roadmap items not in current scope:

- Full RT Plan authoring
- Optimization engine and dose calculation
- Broad AI segmentation platform integration
- Advanced multi-user workflow management

### 2.6 Product Guardrails

New requests should be challenged if they:

- Bypass the repository-backed workflow in favor of direct local-file UX
- Add workflow complexity without improving contour review reliability
- Expose technical cache / load semantics to end users
- Introduce planning features before review workflow hardening is complete
- Increase UI complexity without a clinical workflow reason

### 2.7 Roadmap

Ordered by execution priority, not aspiration.

**Phase A — Infrastructure Hardening** (current)
- Stabilize local setup, startup, and smoke validation
- Make CI reflect the real repository structure
- Establish linting, test, and build baselines
- Define product, technical, and test strategy as explicit source documents
- Exit: setup / up / doctor reliable; CI validates frontend + API + shared types + smoke startup

**Phase B — Review Workflow Hardening**
- Improve repository loading robustness
- Harden RTSTRUCT load / compare / push workflows
- Improve contour QA usability and navigation
- Reduce hidden state and stale-context bugs
- Exit: contour review reproducible across multiple patient datasets; repository round-trip stable

**Phase C — Dose Review Foundation**
- RTDOSE ingestion and dose colorwash overlay
- DVH and dose statistics
- Dose review-oriented comparison workflows
- Starts only after Phase B exit criteria are met

**Phase D — Planning Foundation**
- Planning data model refinement
- Plan / structure / image relationships
- Early planning review surfaces
- Gated behind mature review and dose workflows

**Ongoing (continuous)**
- Developer ergonomics
- CI / release engineering
- Observability and operational diagnostics
- Test evidence quality
- DHF traceability discipline

---

## 3. Customer Requirements

### 1. CRS-001: Clinicians shall view CT/MRI images in axial, sagittal, and coronal planes

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Radiation Therapist / Physician  
As a radiation therapist or physician, I need to view loaded CT or MRI DICOM
images in at least three orthogonal planes (axial, sagittal, coronal) with
synchronized crosshairs, window/level adjustment, and slice navigation.

**Derived From:** UC-001

</div>

---
### 2. CRS-002: Clinicians shall draw and edit contours on image slices

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Physician / Dosimetrist  
As a physician or dosimetrist, I need to draw target volumes and organs at
risk on image slices using freehand, polygon, and brush tools, with the
ability to undo/redo up to 50 actions.

**Derived From:** UC-002

</div>

---
### 3. CRS-003: Clinicians shall navigate contour-bearing slices by structure

<div class="requirement-section" markdown="1">

**Priority**: High  **User Group**: Physician / Dosimetrist / Radiation Therapist  
As a physician or dosimetrist, I need to step through the axial slices that
contain contours for the active structure so I can review and correct each
contour slice without manually scrolling.

**Derived From:** UC-003

</div>

---
### 4. CRS-004: Clinicians shall view automated contour quality warnings for the active structure and structure set

<div class="requirement-section" markdown="1">

**Priority**: High  **User Group**: Physician / Dosimetrist  
As a physician or dosimetrist, I need to see a summary of contour quality
issues for each structure and for the structure set as a whole, so that I can
identify and correct problems before exporting to the DICOM repository.

**Derived From:** UC-003

</div>

---
### 5. CRS-005: Clinicians shall push the active structure set to the DICOM repository

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Physician / Dosimetrist  
As a physician or dosimetrist, I need to save the current structure set back
to the DICOM repository as an RTSTRUCT object so it is available to other
systems and users in the clinical workflow.

**Derived From:** UC-004

</div>

---
### 6. CRS-006: Clinicians shall load an RTSTRUCT from the DICOM repository into the active workspace

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Physician / Dosimetrist / Radiation Therapist  
As a physician or dosimetrist, I need to retrieve a previously saved RTSTRUCT
from the repository and load it into the active workspace so I can continue
editing or reviewing existing structures.

**Derived From:** UC-004

</div>

---
### 7. CRS-007: Clinicians shall compare a repository RTSTRUCT version with the active workspace

<div class="requirement-section" markdown="1">

**Priority**: Medium  **User Group**: Physician / Dosimetrist  
As a physician or dosimetrist, I need to compare a repository RTSTRUCT object
with the current workspace structure set to understand what changed between
versions without disrupting my active editing session.

**Derived From:** UC-004

</div>

---
### 8. CRS-008: Clinicians shall select a patient and study from the DICOMweb repository browser

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Radiation Therapist / Physician  
As a radiation therapist or physician, I need to browse available patients in
the connected DICOM repository, search and filter by clinical identifiers, and
activate a patient and image series as my working context.

**Derived From:** UC-005

</div>

---
### 9. CRS-009: Clinicians shall always see the active patient, image set, structure source, and sync state

<div class="requirement-section" markdown="1">

**Priority**: Critical  **User Group**: Radiation Therapist / Physician / Dosimetrist  
As a radiation therapist or physician, I need persistent visibility of the
currently active patient, image series, structure set source, and repository
synchronization state so I always know which data I am working with.

**Derived From:** UC-004, UC-005

</div>

---
### 10. CRS-010: Clinicians shall be able to reach the system and verify it is operational

<div class="requirement-section" markdown="1">

**Priority**: High  **User Group**: Radiation Therapist / Physician / Dosimetrist  
As a radiation therapist or physician, I need the system to be reachable and
verifiably operational before starting a clinical session, so that I can rely
on it for patient-specific treatment planning work.

**Derived From:** UC-005

</div>

---
### 11. CRS-012: Clinicians shall review the active image set and visible structures in a synchronized 3D viewport

<div class="requirement-section" markdown="1">

**Priority**: High  **User Group**: Radiation Therapist / Physician / Dosimetrist  
As a radiation therapist, physician, or dosimetrist, I need a 3D viewport in
the clinical workspace that shows the active image set and the currently
visible structures so that I can review anatomy and contour coverage in
spatial context without leaving the contouring workflow.

**Derived From:** UC-001

</div>

---

## 4. Summary

| Metric | Count |
|--------|-------|
| **Total CRS Items** | 11 |
| **Critical Priority** | 6 |
| **High Priority** | 4 |
| **Medium Priority** | 1 |

---

## 5. Document Control

**Standard**: IEC 62304:2006+AMD1:2015 §5.2
**Last Updated**: 2026-05-16

---

*Generated from DHF items in DHF Project.*