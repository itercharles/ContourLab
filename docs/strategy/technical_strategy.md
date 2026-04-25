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
requirements. There are two fundamentally different classes of tests with different purposes,
audiences, and artifact obligations.

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
- May be automated or manual; manual tests require `verified_by` and `verification_date`

#### Required Record Fields

Each verification test execution record must include:

| Field | Description |
|---|---|
| `test_id` | Stable identifier (e.g. `SWTEST-001`) |
| `linked_requirements` | One or more `SRS-xxx` or `SYS-xxx` IDs |
| `test_name` | Human-readable description of what is being verified |
| `test_environment` | OS, browser/runtime, Node/dotnet version, key dependency versions |
| `run_id` | CI run identifier or manual session ID |
| `run_date` | ISO 8601 date of execution |
| `result` | `PASS`, `FAIL`, or `BLOCKED` |
| `tester` | CI system name or person name for manual tests |
| `notes` | Optional — deviations, known limitations, workarounds |

#### Annotation Syntax

Automated tests are linked to requirements via `@links` annotations in the test name:

```typescript
describe('dose normalization @links:SRS-012', () => {
  it('normalizes to prescription point', () => { ... })
})
```

The `compliantflow-reporter` extracts these annotations and emits a JUnit XML with
`compliantflow.links` properties. Only annotated tests appear in the verification artifact.

#### Artifacts and Traceability

Verification test results feed into the traceability chain:

```
SYS → SRS → SWDD → SWTEST (execution records)
```

- CI uploads `frontend-junit` artifact (JUnit XML) on every run
- DHF traceability report (`dhf-traceability-report`) includes test coverage on main
- Uncovered SRS or SYS items — those with no linked passing SWTEST record — are flagged
  in the traceability check

#### Adding a New Verification Test

1. Create a `SWTEST-xxx` item in WebTPS-DHF with `linked_requirements`, `test_name`,
   `test_environment`, and initial `status: draft`
2. Implement the test with `@links:SRS-xxx` or `@links:SYS-xxx` annotation
3. On CI pass, transition `SWTEST-xxx` to `verified`
4. Traceability check will now show the requirement as covered
