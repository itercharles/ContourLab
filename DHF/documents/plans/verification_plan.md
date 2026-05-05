# Software Verification Plan

**Standard:** IEC 62304:2006+AMD1:2015 §5.5–5.7
**Status:** Active

## 1. Introduction

This document defines the verification strategy for WebTPS. Verification confirms that
software units and the integrated system satisfy their specified requirements. It does not
confirm that those requirements satisfy user needs — that is addressed in the Validation Plan.

Verification is performed at three levels corresponding to the DHF item hierarchy:

| Level | DHF items verified | Test type | CI phase |
|---|---|---|---|
| Software unit | SRS | Test-SRS (Vitest `@links`) | `verify-srs` |
| Software system | SYS | Test-SYS (Playwright) | `verify-sys` |
| Architecture | SYSARCH | Review + traceability check | CI Phase 2 |

## 2. Scope

All SRS and SYS items in WebTPS-DHF are in scope for verification. Items with
`category: Maintainability` or `category: Change Control` are exempt from the
functional traceability requirement but must still be reviewed.

## 3. Verification Tasks and Acceptance Criteria

| Deliverable | Verification Task | Acceptance Criteria | Milestone |
|---|---|---|---|
| SRS items | Automated Test-SRS suite (Vitest `@links`) | All linked tests PASS; 100% SRS functional coverage | Before release |
| SYS items | Automated Test-SYS suite (Playwright) | All linked tests PASS; 100% SYS functional coverage | Before release |
| SYSARCH items | Architecture review + DHF traceability check | All SYS items covered by SYSARCH | Before Phase B |
| SWDD items | Design review + linked Test-SRS passing | All SWDD items traceable to passing SRS tests | Before integration |

## 4. Test-SRS — Software Requirement Verification

**Standard reference:** IEC 62304 §5.5–5.6

**Tooling:** Vitest with `verification-reporter`

**Annotation syntax:**
```typescript
describe('dose normalization @links:SRS-012', () => {
  it('normalizes to prescription point', () => { ... })
})
```

**Artifact:** `verify-srs-junit` (JUnit XML, uploaded on every CI run)

**DHF item:** Each test suite maps to one or more `SWTEST` items in WebTPS-DHF with
`linked_requirements` pointing to `SRS-xxx` items.

**Acceptance:** All annotated tests PASS; no SRS functional item is uncovered in the
traceability report.

## 5. Test-SYS — System Requirement Verification

**Standard reference:** IEC 62304 §5.7, IEC 82304-1 §6.2

**Tooling:** Playwright, running against the full stack (frontend + API + Orthanc)

**Test location:** `apps/client/e2e/sys/`

**Annotation syntax:**
```typescript
test('DICOM series loads within 5 seconds @links:SYS-004', async ({ page }) => { ... })
```

**Artifact:** `verify-sys-junit` (JUnit XML, uploaded on every CI run)

**Acceptance:** All annotated tests PASS; no SYS functional item is uncovered.

## 6. Architecture Verification

SYSARCH items are verified by:

1. Traceability check: every SYS item must be linked to at least one SYSARCH item
   (`python -m compliantflow --dhf DHF dhf validate traceability` in CI Phase 2)
2. Architecture review: SYSARCH items reviewed at each significant architecture change
   via PR review in WebTPS-DHF

## 7. Anomaly Management

Verification anomalies (test failures, traceability gaps) are documented as CR items
in WebTPS-DHF and resolved before release. The traceability report (`dhf-traceability-report`
artifact) records the state of all coverage at each main-branch build.

## 8. Verification Environment

| Item | Value |
|---|---|
| OS | Ubuntu (GitHub Actions `ubuntu-latest`) |
| Browser | Chromium (Playwright default) |
| Node.js | 20 |
| .NET SDK | 10.0.x |
| DICOM repository | Orthanc (Docker, no authentication) |
| Test runner | Vitest 2 (Test-SRS), Playwright (Test-SYS) |

## 9. Adding a New Verification Test

1. Create a `SWTEST-xxx` item in WebTPS-DHF (`status: draft`, `linked_requirements: [SRS-xxx]`)
2. Implement the test with `@links:SRS-xxx` annotation
3. On CI pass, transition `SWTEST-xxx` to `verified`
4. Traceability check will show the requirement as covered
