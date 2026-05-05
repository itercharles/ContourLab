# Software Development Plan

**Standard:** IEC 62304:2006+AMD1:2015
**Status:** Active

## 1. Introduction

This document defines the development approach for WebTPS — a web-based radiation therapy
Treatment Planning System. WebTPS is classified as **IEC 62304 Safety Class C** software
due to its direct role in radiation dose calculation and treatment plan delivery, where a
software failure could cause serious injury or death.

## 2. Development Phases

### Phase A: Contouring (current)
- **Goal**: Clinical DICOM viewer, contour tools, structure management
- **Activities**:
  - Define Use Cases (UC) and Customer Requirements (CRS)
  - Establish System Requirements (SYS) and Software Requirements (SRS)
  - Implement DICOM loading, Cornerstone3D viewport, contour editing
  - Verification tests linked to SRS items via `@links` annotations

### Phase B: Review
- **Goal**: Dose visualization, DVH, plan comparison, protocol compliance
- **Activities**:
  - Extend SYS/SRS for dose and review workflows
  - Implement dose overlay, DVH rendering, plan comparison
  - System-level Playwright verification tests (Test-SYS)

### Phase C: Planning
- **Goal**: Beam geometry, dose calculation, optimization, DICOM-RT export
- **Activities**:
  - Full SRS for planning engine
  - Integration with external dose calculation components
  - Validation testing via clinical workflow Playwright tests (Test-CRS)

### Phase D: Release
- **Goal**: Validation, regulatory submission readiness
- **Activities**:
  - Complete validation test execution (Test-CRS against UC/CRS items)
  - Risk management closure (all RISK/RCM items verified)
  - Release packaging and deployment

## 3. Coordination with System Development

WebTPS is a software-only medical device; there is no separate hardware system development
activity. Coordination between software and system-level activities is achieved as follows:

- **System requirements (SYS items)** are defined and baselined in WebTPS-DHF before
  software design begins. Software architecture and detailed design derive from system
  requirements via traceable links.
- **System integration** is performed by integrating frontend, API, and DICOM repository
  through the CI pipeline (`dev-integration` smoke check and `verify-sys` Playwright tests).
  Integration results are recorded as GitHub Actions artifacts.
- **System verification** is performed by executing Playwright Test-SYS tests against the
  full running stack. Each SYS item must be linked to at least one passing SWTEST record.
- **System validation** is performed by executing Playwright Test-CRS tests that drive the
  browser through complete clinical workflows. Each CRS/UC item must be covered.
- Any change to system requirements triggers a review of affected software items and
  associated test cases via the Change Request (CR) process.

## 4. Development Standards, Methods, and Tools

| Category | Item |
|---|---|
| Standards | IEC 62304 (medical device software), ISO 14971 (risk management), IEC 82304-1 (health software) |
| Methods | YAML-based DHF items, git-based traceability, CR-driven change control, GitOps approval workflow |
| Frontend | React 18, TypeScript (strict), Vite, Tailwind CSS, Cornerstone3D |
| Backend | ASP.NET Core 10 (C#) |
| DICOM | Orthanc (DICOMweb-compatible repository, Docker) |
| Shared types | `@webtps/shared-types` TypeScript package |
| Verification | Vitest (Test-SRS), Playwright (Test-SYS, Test-CRS) |
| CI/CD | GitHub Actions |
| DHF tooling | Python CLI (`python -m compliantflow dhf`) in WebTPS-DHF |

## 5. Document Lifecycle

All documents are version-controlled in WebTPS-DHF. Each follows the GitOps document
control procedure: draft on a feature branch → review via GitHub pull request → approval
by merge to `main` → modification via a new pull request referencing the applicable CR item.

| Document | Purpose |
|---|---|
| Development Plan (this document) | Development approach, standards, methods, tools, document lifecycle |
| Verification Plan | Verification tasks, deliverables, milestones, acceptance criteria |
| Validation Plan | Validation approach, clinical workflow test strategy, acceptance criteria |
| Integration Plan | Integration sequence and integration testing strategy |
| Configuration Management Plan | CM scheme, controlled items, change control procedures |
| Risk Management Plan | Risk acceptability criteria, risk management activities, responsibilities |
| Maintenance Plan | Post-production feedback, problem reporting and resolution |

## 6. Defect Identification and Management

### 6.1 Defect Categories and Controls

| Category | Introduced by | Control |
|---|---|---|
| Logic defects | TypeScript/C# algorithmic errors | Vitest unit tests on every PR (`verify-srs` CI phase) |
| Type safety defects | TypeScript `any` usage or model drift | Strict TypeScript mode; `pnpm -r typecheck` in CI |
| DICOM handling defects | DICOMweb protocol edge cases | Integration smoke tests; Playwright SYS tests |
| Dose computation defects | Numerical precision, algorithm errors | Dedicated SRS items; Test-SRS verification tests |
| Regression defects | Unintended side-effects of changes | Full CI pipeline on every PR |
| Traceability defects | Missing DHF links | `python -m compliantflow --dhf DHF dhf validate traceability` in CI Phase 2 |

Evidence of defect control: CI pipeline test results stored as GitHub Actions artifacts
(`verify-srs-junit`, `verify-sys-junit`, `validate-crs-junit`) on every build.

## 7. Build and Release Procedure

### 7.1 Build Environment

| Item | Value |
|---|---|
| OS | Ubuntu (GitHub Actions `ubuntu-latest`) |
| Node.js | 20 (pinned via `actions/setup-node`) |
| pnpm | 9 |
| .NET SDK | 10.0.x (pinned via `actions/setup-dotnet`) |
| DICOM repository | Orthanc (Docker) |
| CI platform | GitHub Actions |

### 7.2 Release Procedure

1. All CR items for the release are resolved and merged to `main`
2. Full CI pipeline passes: dev → verify → validate → compliance
3. DHF traceability report shows 0 orphans and full coverage for release scope
4. A Git tag (`vX.Y.Z`) is created on the passing `main` commit
5. Spec PDFs, test reports, and traceability report are archived as CI artifacts
6. Release notes are updated in WebTPS-DHF with version, build environment, and known anomalies

---

## 8. Technical Direction

### 8.1 Architectural Principles

WebTPS should remain a small number of explicit layers:

- `apps/client`: clinical web UI and browser-side workflow state
- `apps/api`: thin HTTP gateway and service integration boundary
- `packages/shared-types`: canonical shared domain model
- DICOM repository: external system of record for image and RT objects

The architecture stays explicit and boring. Complexity must not be hidden behind premature abstraction.

1. **Repository-first data flow** — image and RT object access flows through DICOMweb-compatible
   repositories. Local direct-file workflows are secondary and must not shape the main architecture.

2. **Thin API until justified** — keep logic in the client when it is clearly client-owned workflow
   behavior. Move to API only when server-side integration, security, orchestration, or long-running
   execution is required.

3. **Shared types as the contract boundary** — domain model drift between frontend and API is not
   acceptable. Shared model changes happen in `packages/shared-types` first.

4. **Operationally testable workflows** — prefer architectures that can be verified in CI and local
   smoke tests over clever local optimizations.

5. **Controlled AI-assisted change process** — agent execution is constrained by explicit product
   direction, DHF traceability expectations, and post-change verification requirements.

### 8.2 Engineering Guardrails

Avoid:

- Duplicating types across workspaces
- Introducing local-only workflows that bypass repository architecture
- Broad refactors without explicit test and DHF implications
- Adding infrastructure tools without a clear maintenance owner or CI role
- Embedding fragile agent-only assumptions into product code paths

---

## 9. DevOps Strategy

Near-term DevOps work must deliver:

- Deterministic local setup
- Reproducible CI validation
- Environment health checks via `pnpm local:doctor`
- Actionable failure logs
- Simple deployment packaging path once local and CI are stable

Recommended next milestones after current baseline:

- Preview environment deployment
- Artifact versioning
- Release checklist automation
- Service log aggregation / observability
- Backup / restore strategy for repository-backed test environments

---

## 10. Testing Strategy

Testing exists to protect clinical workflow reliability and satisfy IEC 62304 software verification
and validation requirements. There are two fundamentally different classes of tests with different
purposes, audiences, and artifact obligations.

### 10.1 Development Tests

Development tests are engineering tools supporting fast feedback during implementation and protecting
against regression. They are **not** part of the audit record.

| Layer | Scope | Command |
|---|---|---|
| Unit / component | Pure logic, isolated UI behavior | `pnpm --filter @webtps/client test` |
| Workspace typecheck | Type correctness across workspaces | `pnpm -r typecheck` |
| Lint | Code style and static checks | `pnpm --filter @webtps/client lint` |
| Build | Compilation succeeds | `pnpm -r build` |
| Integration smoke | Full stack health check | `pnpm local:doctor` |

Results are transient — not stored as compliance artifacts. Failure blocks merge.

### 10.2 Verification Tests

Verification tests are regulatory evidence. They formally demonstrate that software units and the
integrated system meet their specified requirements per IEC 62304 §5.5–5.7 and §5.8.

Every verification test is a persistent DHF record traceable to a requirement, executed in a
documented environment, and retained as audit evidence.

**Test-SRS — Software Requirement Verification (IEC 62304 §5.5–5.6)**
- Verifies software units and components satisfy SRS items
- Automated via Vitest with `@links:SRS-xxx` annotations
- JUnit XML artifact (`verify-srs-junit`) is the execution record

**Test-SYS — System Requirement Verification (IEC 62304 §5.7)**
- Verifies the integrated system (frontend + API + DICOM repository) satisfies SYS items
- Automated via Playwright browser tests against the full running stack
- JUnit XML artifact (`verify-sys-junit`) is the execution record

**Test-CRS — Customer Requirement Validation (IEC 62304 §5.8)**
- Validates that the system satisfies CRS items and Use Cases as experienced by the clinical user
- Playwright end-to-end tests driving the browser through complete clinical workflows
- Test environment must record browser version, OS, and stack versions — these represent the
  validated configuration for the release
- JUnit XML artifact (`validate-crs-junit`) is the execution record

### 10.3 Annotation Syntax

**Vitest (Test-SRS):**
```typescript
describe('dose normalization @links:SRS-012', () => {
  it('normalizes to prescription point', () => { ... })
})
```

**Playwright (Test-SYS, Test-CRS):**
```typescript
test('contour roundtrip @links:SYS-004,CRS-003', async ({ page }) => { ... })
```

### 10.4 Traceability Chain

```
UC → CRS → SYS → SRS → SWDD
              ↓     ↓
           SWTEST (execution records, linked per level)
```

| Artifact | Content | Trigger |
|---|---|---|
| `verify-srs-junit` | Vitest Test-SRS results | Every PR + push |
| `verify-sys-junit` | Playwright Test-SYS results | Every PR + push |
| `validate-crs-junit` | Playwright Test-CRS results | main only |
| `dhf-traceability-report` | Full traceability JSON incl. test coverage | main only |

### 10.5 Required Record Fields

Each verification/validation test execution record must include:

| Field | Description |
|---|---|
| `test_id` | Stable identifier (e.g. `SWTEST-001`) |
| `linked_requirements` | One or more `SRS-xxx`, `SYS-xxx`, `CRS-xxx`, or `UC-xxx` IDs |
| `test_name` | Human-readable description of what is verified or validated |
| `test_environment` | OS, browser name+version, Node/dotnet version, key dependency versions |
| `run_id` | CI run identifier |
| `run_date` | ISO 8601 date of execution |
| `result` | `PASS`, `FAIL`, or `BLOCKED` |

### 10.6 Adding a New Verification Test

1. Create a `SWTEST-xxx` item in WebTPS-DHF with `linked_requirements`, `test_name`,
   `test_environment`, and `status: draft`
2. Implement the test with the appropriate `@links:XXX-nnn` annotation
3. On CI pass, transition `SWTEST-xxx` to `verified`
4. Traceability check will now show the linked requirement as covered
