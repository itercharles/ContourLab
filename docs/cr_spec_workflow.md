# CR And Spec Workflow

## Purpose

This document defines the CR-driven workflow for WebTPS. All DHF content —
CR items, requirements, risks, specs — lives in this repository under `DHF/`
and `docs/cr-specs/`.

## Sources of Truth

- `DHF/items/` — CR lifecycle, requirement/risk/design items
- `docs/cr-specs/` — CR specification documents (authoritative plan specs)
- `.github/workflows/` — CR automation (cr-analyze, cr-design, cr-develop, cr-complete)

## PR Topology

1. `cr/CR-NNN` — CR intake PR (human-authored)
2. `spec/CR-NNN` — AI-generated analysis spec PR
3. `design/CR-NNN` — AI-generated DHF design items PR
4. `feat/CR-NNN` — AI-generated implementation PR

All four PRs are in this repository.

## State Model

| State | Meaning |
|-------|---------|
| `draft` | CR created, not yet submitted |
| `in_review` | CR PR open, awaiting human approval |
| `designing` | CR approved; agent generating plan spec |
| `implementing` | Plan approved; agent implementing |
| `completed` | Implementation merged; DHF closed out |
| `cancelled` | CR declined |

Normal flow: `draft → in_review → designing → implementing → completed`

Exceptional return: `implementing → designing` — only when implementation feedback
invalidates the approved plan and the spec must be revised.

## Stage Ownership

### Stage 1 — Analysis

- Trigger: `cr/CR-NNN` PR merged
- Workflow: `cr-analyze.yml`
- Output: `spec/CR-NNN` PR with AI-generated analysis spec in `docs/cr-specs/`

### Stage 2 — Design

- Trigger: `spec/CR-NNN` PR merged
- Workflow: `cr-design.yml`
- Output: `design/CR-NNN` PR with updated DHF items in `DHF/items/`

### Stage 3 — Implementation

- Trigger: `design/CR-NNN` PR merged
- Workflow: `cr-develop.yml`
- Output: `feat/CR-NNN` PR with product code changes

### Stage 4 — Completion

- Trigger: `feat/CR-NNN` PR merged
- Workflow: `cr-complete.yml`
- Output: CR transitioned to `completed` in `DHF/items/09_cr/`

## Runtime Prerequisites

All workflows use `GITHUB_TOKEN` — no cross-repo secrets required.

Repository variables needed:
- `CR_ANALYZE_MODEL` — Claude model for analysis
- `CR_DESIGN_MODEL` — Claude model for design
- `CR_DEVELOP_MODEL` — Claude model for implementation

Secrets needed:
- `ANTHROPIC_API_KEY`
