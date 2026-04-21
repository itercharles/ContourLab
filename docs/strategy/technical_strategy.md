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
