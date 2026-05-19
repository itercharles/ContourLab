# Software Validation Plan

**Standard:** IEC 62304:2006+AMD1:2015 §5.8, IEC 82304-1:2016 §6.3
**Status:** Active

## 1. Objective

Confirm that ContourLab satisfies its defined Customer Requirements (CRS) and Use Cases (UC)
as experienced by clinical users operating the system in its intended environment.

Validation is distinct from verification: verification asks "did we build the software
correctly?"; validation asks "did we build the correct software for clinical use?"

## 2. Scope

All CRS and UC items in ContourLab-DHF are in scope for validation. Validation is performed
by driving the browser through complete clinical workflows using Playwright (Test-CRS).

**Intended use:** ContourLab is intended for use by qualified radiation therapy treatment
planners to create, review, and export radiation treatment plans. It is not intended for
direct patient-facing use.

**Intended users:** Radiation therapy treatment planners, dosimetrists, radiation oncologists.

**Intended environment:** Clinical workstation with modern browser (Chrome/Chromium),
connected to a DICOMweb-compatible repository.

## 3. Validation Strategy

Validation tests (Test-CRS) simulate complete clinical workflows from the user's perspective.
Each test scenario corresponds to one or more CRS or UC items and is executed against the
full running system (frontend + API + DICOM repository).

**Tooling:** Playwright, running against `http://127.0.0.1:3000` with a seeded DICOM repository

**Test location:** `apps/client/e2e/crs/`

**Annotation syntax:**
```typescript
test('load patient and view CT @links:CRS-003,UC-007', async ({ page }) => {
  await page.goto('/workspace')
  // ... drive complete clinical workflow
})
```

**Artifact:** `validate-crs-junit` (JUnit XML, uploaded on main branch CI runs)

## 4. Validation Scenarios

Validation scenarios map to the clinical workflow phases of ContourLab:

| Scenario | CRS/UC items | Workflow |
|---|---|---|
| Patient selection and DICOM import | UC-001, CRS-001 | Open patient browser → click Import DICOM (opens Orthanc Explorer in a new tab) → upload files in Orthanc → return to ContourLab → confirm new study appears in the worklist after auto-refresh |
| CT series loading and viewport display | UC-002, CRS-002, CRS-003 | Select study → load CT → confirm all slices render |
| Structure set creation and editing | UC-003, CRS-005 | Create RTSTRUCT → draw contour → edit contour → confirm persistence |
| Structure export | UC-004, CRS-006 | Edit structure → export RTSTRUCT → confirm DICOMweb push |
| Multi-series display | UC-005, CRS-004 | Load CT + dose → display overlay → confirm DVH |

## 5. Test Environment

| Item | Value |
|---|---|
| OS | Ubuntu (GitHub Actions `ubuntu-latest`) |
| Browser | Chromium (Playwright) |
| Node.js | 20 |
| .NET SDK | 10.0.x |
| DICOM repository | Orthanc (Docker), seeded with test DICOM datasets |
| Screen resolution | 1920×1080 (Playwright default) |

The validated configuration (browser version, OS, key dependency versions) is recorded
in the `test_environment` field of each `SWTEST` DHF item and in the CI run artifact.

## 6. Acceptance Criteria

- All Test-CRS tests PASS
- No CRS or UC functional item is uncovered in the DHF traceability report
- Any open anomalies are documented as CR items, assessed for clinical risk, and
  accepted by a qualified reviewer before release

## 7. Anomaly Management

Validation anomalies are documented as CR items. Each anomaly is assessed for:
- Clinical impact and patient safety implications
- Whether the anomaly constitutes a safety hazard (triggers RISK item creation)
- Disposition: fix before release, defer with documented justification, or accept as
  known limitation with risk assessment

## 8. Adding a New Validation Test

1. Create a `SWTEST-xxx` item in ContourLab-DHF (`status: draft`, `linked_requirements: [CRS-xxx]`)
2. Implement the Playwright test in `apps/client/e2e/crs/` with `@links:CRS-xxx` annotation
3. On CI pass, transition `SWTEST-xxx` to `verified`
4. Traceability check will show the CRS/UC requirement as covered
