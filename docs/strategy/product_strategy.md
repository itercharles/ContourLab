# Product Strategy

## Product Position

WebTPS is a browser-based radiation therapy planning workspace. The near-term
product is **not** a full TPS replacement. The near-term product is a focused
clinical workstation for:

- DICOM repository-backed image access
- RT Structure Set review
- contour correction and QA
- repository round-trip for RTSTRUCT publishing

The product should remain narrow until the review workflow is operationally
stable.

## Current Strategic Focus

Feature development is temporarily subordinate to infrastructure and delivery
reliability. The immediate goal is to make WebTPS:

- reproducible to set up locally
- testable across frontend, API, and repository workflows
- safe for repeated AI-assisted change cycles
- explicit about roadmap boundaries so ad hoc requests do not pull the product
  off course

## User Priorities

Primary users:

- radiation oncologists
- medical physicists
- dosimetrists

What they need first:

- predictable repository-driven loading
- stable contour display and editing
- clear active patient / image / RTSS context
- QA visibility and review ergonomics
- trustworthy save / push behavior

## What We Will Optimize For

1. Reliability of the contour review workflow
2. Simplicity of the clinical interaction model
3. Repository interoperability over local-file shortcuts
4. Fast feedback for development and verification
5. Traceable change management across app code and DHF

## What We Will Explicitly Defer

Until the review platform is stable, avoid expanding scope into:

- full RT Plan authoring
- optimization engine work
- dose calculation engine work
- broad AI segmentation platform integration inside WebTPS
- advanced multi-user workflow management

These remain roadmap items, but they are not the current execution priority.

## Product Guardrails

New requests should be challenged if they:

- bypass the repository-backed workflow in favor of direct local-file UX
- add workflow complexity without improving contour review reliability
- expose technical cache / load semantics to end users
- introduce planning features before review workflow hardening is complete
- increase UI complexity without a clinical workflow reason

## Delivery Intent For The Next Phase

The next phase is an infrastructure-hardening phase. Success means:

- a new developer can bootstrap the project with one documented path
- CI reflects the actual runnable system
- AI changes are checked against product direction and DHF impact before coding
- post-implementation verification is explicit and repeatable

## Roadmap

Ordered by execution priority, not aspiration.

### Phase A: Infrastructure Hardening

Status: current priority

Goals:

- stabilize local setup, startup, and smoke validation
- make CI reflect the real repository structure
- establish linting, test, and build baselines
- add AI execution harness and request-governance checklists
- define product, technical, and test strategy as explicit source documents

Exit criteria:

- setup / up / doctor are reliable on supported local environments
- CI validates frontend, API, shared types, and smoke startup
- agent workflow enforces pre-analysis and post-implementation checks

### Phase B: Review Workflow Hardening

Begins after Phase A exit criteria are met.

Goals:

- improve repository loading robustness
- harden RTSTRUCT load / compare / push workflows
- improve contour QA usability and navigation
- ensure all contour review tools behave consistently across repeated reloads
- reduce hidden state and stale-context bugs

Exit criteria:

- contour review workflows are reproducible across multiple patient datasets
- repository round-trip behavior is stable under repeated user testing

### Phase C: Dose Review Foundation

Goals:

- RTDOSE ingestion
- dose colorwash overlay
- DVH and dose statistics
- dose review-oriented comparison workflows

Starts only after review workflow stability is credible.

### Phase D: Planning Foundation

Goals:

- planning data model refinement
- plan / structure / image relationships
- early planning review surfaces

Gated behind mature review and dose workflows.

### Ongoing Cross-Cutting Work

Continuous — not to be postponed:

- developer ergonomics
- CI / release engineering
- observability and operational diagnostics
- test evidence quality
- DHF traceability discipline
