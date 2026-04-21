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
