# Technical Strategy

## Architectural Direction

WebTPS should remain a small number of explicit layers:

- `apps/client`: clinical web UI and browser-side workflow state
- `apps/api`: thin HTTP gateway and service integration boundary
- `packages/shared-types`: canonical shared domain model
- DICOM repository: external system of record for image and RT objects

The architecture should stay explicit and boring. Complexity should not be
hidden behind premature abstraction.

## Technical Principles

1. Repository-first data flow
   Image and RT object access should flow through DICOMweb-compatible
   repositories. Local direct-file workflows are secondary and should not shape
   the main product architecture.

2. Thin API until backend logic is justified
   Keep logic in the client when it is clearly client-owned workflow behavior.
   Move logic to the API only when it needs server-side integration, security,
   orchestration, or long-running execution.

3. Shared types as the contract boundary
   Domain model drift between frontend and API is not acceptable. Shared model
   changes happen in `packages/shared-types` first.

4. Operationally testable workflows over clever local optimizations
   Prefer architectures that can be verified in CI and local smoke tests.

5. Controlled AI-assisted change process
   Agent execution should be constrained by explicit product direction, DHF
   traceability expectations, and post-change verification requirements.

## Current Technical Priorities

- CI / smoke validation that matches the actual runtime stack
- lint / typecheck / build baselines that are enforceable
- clearer separation between source-of-truth repository data and browser-local
  transient state
- predictable startup and diagnostics for frontend, API, and Orthanc
- reducing stale references and hidden UI state across reloads

## Engineering Guardrails

Avoid:

- duplicating types across workspaces
- introducing local-only workflows that bypass repository architecture
- broad refactors without test and DHF implications being explicit
- adding infrastructure tools without a clear maintenance owner or CI role
- embedding fragile agent-only assumptions into product code paths

## DevOps Strategy

Near-term DevOps work should deliver:

- deterministic local setup
- reproducible CI validation
- environment health checks
- actionable failure logs
- simple deployment packaging path once local and CI are stable

Recommended next DevOps milestones after the current baseline:

- preview environment deployment
- artifact versioning
- release checklist automation
- service log aggregation / observability
- backup / restore strategy for repository-backed test environments

## Testing Strategy

Testing exists to protect clinical workflow reliability and satisfy IEC 62304 software verification
and validation requirements. There are two fundamentally different classes of tests with different
purposes, audiences, and artifact obligations.

---

### Development Tests

Development tests are engineering tools. They exist to support fast feedback during implementation
and protect against regression during refactoring. They are **not** part of the audit record.

**Characteristics:**
- Colocated with source code (`*.test.ts(x)`)
- Run on every PR and push in CI
- No formal test ID, no DHF linkage required
- Results are transient — not stored as compliance artifacts
- Failure blocks merge; passing is a prerequisite for proceeding

**Layers:**

| Layer | Scope | Command |
|---|---|---|
| Unit / component | Pure logic, isolated UI behavior | `pnpm --filter @webtps/client test` |
| Workspace typecheck | Type correctness across workspaces | `pnpm -r typecheck` |
| Lint | Code style and static checks | `pnpm --filter @webtps/client lint` |
| Build | Compilation succeeds | `pnpm -r build` |
| Integration smoke | Full stack health check | `pnpm local:doctor` |

**Guardrails:**
- Tests assert behavior, not implementation details
- No flaky integration checks without deterministic setup
- Do not rely solely on manual testing for workflow changes

---

### Verification Tests

Verification tests are regulatory evidence. They formally demonstrate that software units and the
integrated system meet their specified requirements, as required by IEC 62304 §5.5 (software unit
verification), §5.6 (software integration testing), and §5.7 (software system testing).

Every verification test is a persistent DHF record that must be traceable to a requirement,
executed in a documented environment, and retained as audit evidence.

#### Test Levels

**Test-SRS — Software Requirement Verification**
- Verifies that individual software units and components satisfy Software Requirement Specification
  (SRS) items
- Corresponds to IEC 62304 §5.5–5.6 (unit verification and software integration)
- DHF item type: `SWTEST`, linked to one or more `SRS-xxx` items
- Typically automated; JUnit XML artifact is the execution record

**Test-SYS — System Requirement Verification**
- Verifies that the integrated system (frontend + API + DICOM repository) satisfies System
  Requirement Specification (SYS) items
- Corresponds to IEC 62304 §5.7 (software system testing) and IEC 82304-1 §6.2
- DHF item type: `SWTEST`, linked to one or more `SYS-xxx` items
- Automated via Playwright browser tests against a running full stack

**Test-CRS — Customer Requirement Validation**
- Validates that the system satisfies Customer Requirement Specification (CRS) items and Use Cases
  (UC) as experienced by the clinical user
- Corresponds to IEC 62304 §5.8 (software system validation) and IEC 82304-1 §6.3
- DHF item type: `SWTEST`, linked to one or more `CRS-xxx` or `UC-xxx` items
- Implemented as Playwright end-to-end tests that drive the browser through complete clinical
  workflows (e.g. patient select → image load → contour edit → structure export)
- Test environment must record browser version, OS, and stack versions — these represent the
  validated configuration for the release

The distinction between Test-SYS and Test-CRS is one of perspective: Test-SYS checks that a
technical system requirement is met; Test-CRS checks that a clinical user need is satisfied
end-to-end through the actual UI.

#### Browser Automation Tooling

Playwright is the preferred tool for Test-SYS and Test-CRS:

- Full control of Chromium/Firefox/WebKit — matches real clinical browser environments
- Native support for WebSockets (required for real-time DICOM streaming and viewport sync)
- Built-in video recording and trace capture for audit evidence
- JUnit XML reporter (`@playwright/test` built-in) feeds directly into the DHF artifact pipeline
- TypeScript-native — consistent with the rest of the stack

Test files live at `apps/client/e2e/` and are excluded from the Vitest unit test run.

```typescript
// apps/client/e2e/contour-workflow.spec.ts
test('load CT and create structure set @links:CRS-003,UC-007', async ({ page }) => {
  await page.goto('/workspace')
  // ... drive the clinical workflow
})
```

CI runs Playwright tests after the integration smoke phase, against the full stack
(`frontend + API + Orthanc`). Playwright's built-in JUnit reporter writes to
`test-results/e2e-junit.xml`, uploaded as a separate `e2e-junit` artifact.

#### Required Record Fields

Each verification/validation test execution record must include:

| Field | Description |
|---|---|
| `test_id` | Stable identifier (e.g. `SWTEST-001`) |
| `linked_requirements` | One or more `SRS-xxx`, `SYS-xxx`, `CRS-xxx`, or `UC-xxx` IDs |
| `test_name` | Human-readable description of what is being verified or validated |
| `test_environment` | OS, browser name+version, Node/dotnet version, key dependency versions |
| `run_id` | CI run identifier |
| `run_date` | ISO 8601 date of execution |
| `result` | `PASS`, `FAIL`, or `BLOCKED` |
| `tester` | CI system name |
| `notes` | Optional — deviations, known limitations, workarounds |

#### Annotation Syntax

**Vitest (Test-SRS):** `@links` annotations in test/describe names, extracted by `verification-reporter`:

```typescript
describe('dose normalization @links:SRS-012', () => {
  it('normalizes to prescription point', () => { ... })
})
```

**Playwright (Test-SYS, Test-CRS):** `@links` annotations in test titles, extracted by a custom
Playwright reporter (same convention, different runner):

```typescript
test('contour roundtrip @links:SYS-004,CRS-003', async ({ page }) => { ... })
```

#### Artifacts and Traceability

Verification and validation test results feed into the full traceability chain:

```
UC → CRS → SYS → SRS → SWDD
              ↓     ↓
           SWTEST (execution records, linked per level)
```

| Artifact | Content | Trigger |
|---|---|---|
| `frontend-junit` | Vitest Test-SRS results (JUnit XML) | PR + push |
| `e2e-junit` | Playwright Test-SYS + Test-CRS results (JUnit XML) | main only |
| `dhf-traceability-report` | Full traceability JSON incl. test coverage | main only |

Uncovered items at any level — SRS, SYS, CRS, or UC — are flagged in the traceability check.

#### Adding a New Verification or Validation Test

1. Create a `SWTEST-xxx` item in WebTPS-DHF with `linked_requirements`, `test_name`,
   `test_environment`, and `status: draft`
2. Implement the test with the appropriate `@links:XXX-nnn` annotation
3. On CI pass, transition `SWTEST-xxx` to `verified`
4. Traceability check will now show the linked requirement as covered
