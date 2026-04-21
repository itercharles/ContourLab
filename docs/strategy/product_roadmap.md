# Product Roadmap

## Roadmap Horizon

This roadmap is ordered by execution priority, not by aspiration.

## Phase A: Infrastructure Hardening

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

## Phase B: Review Workflow Hardening

Begins after Phase A exit criteria are met

Goals:

- improve repository loading robustness
- harden RTSTRUCT load / compare / push workflows
- improve contour QA usability and navigation
- ensure all contour review tools behave consistently across repeated reloads
- reduce hidden state and stale-context bugs

Exit criteria:

- contour review workflows are reproducible across multiple patient datasets
- repository round-trip behavior is stable under repeated user testing

## Phase C: Dose Review Foundation

Goals:

- RTDOSE ingestion
- dose colorwash overlay
- DVH and dose statistics
- dose review-oriented comparison workflows

This phase starts only after review workflow stability is credible.

## Phase D: Planning Foundation

Goals:

- planning data model refinement
- plan / structure / image relationships
- early planning review surfaces

This phase should remain gated behind mature review and dose workflows.

## Ongoing Cross-Cutting Work

These are continuous and should not be postponed:

- developer ergonomics
- CI / release engineering
- observability and operational diagnostics
- test evidence quality
- DHF traceability discipline
