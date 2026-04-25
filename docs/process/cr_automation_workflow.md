# CR Automation Workflow

## Purpose

This document defines the change-request-driven automation workflow for WebTPS.

The goal is to make AI execution gated, reviewable, and traceable. AI should
not move directly from a user idea to code implementation without explicit
human approval checkpoints.

This workflow spans two repositories:

- `WebTPS-DHF` for the CR item, CR Spec, and formal DHF lifecycle
- `WebTPS` for implementation work

## Core Principle

Every non-trivial change starts from a CR and passes through three PR stages:

1. `CR PR`
2. `Plan Spec PR`
3. `Implementation PR`

No stage may advance automatically without the required human approval for the
previous stage.

## PR Topology

### 1. CR PR

Repository:

- `WebTPS-DHF`

Contents:

- CR item only

Purpose:

- define the requested change
- establish initial scope and review intent

Rules:

- created by a human
- requires human approval before AI analysis begins
- CR status starts as `new`

### 2. Plan Spec PR

Repository:

- `WebTPS-DHF`

Contents:

- `docs/cr-specs/CRxxx-Spec.md`
- optional CR-adjacent DHF documentation updates

Purpose:

- capture AI analysis
- define the proposed implementation plan
- identify impacted areas, DHF impact, architecture impact, validation plan,
  and open questions

Rules:

- created or updated by AI only after the CR PR is approved
- requires human approval before AI implementation begins
- if plan-level review feedback changes scope or approach, AI updates the spec
  and resubmits for review in `WebTPS-DHF`

### 3. Implementation PR

Repositories:

- `WebTPS`
- optionally `WebTPS-DHF`

Contents:

- implementation code
- tests
- documentation updates
- DHF updates when required

Purpose:

- implement the approved plan spec
- provide automated validation results
- provide manual testing steps

Rules:

- created only after the Plan Spec PR is approved
- requires human review and approval before merge
- if implementation feedback invalidates the approved plan, AI must update the
  plan spec before continuing

## CR Status Model

CR items follow the global DHF lifecycle. The states relevant to the CR workflow are:

| Status | Meaning |
|---|---|
| `draft` | CR has been created; no AI analysis has started |
| `in_review` | CR PR is open and awaiting human approval |
| `designing` | CR PR approved; AI is generating or revising the plan spec |
| `implementing` | Plan Spec PR approved; AI is implementing; Implementation PR is active |
| `completed` | Implementation merged; required DHF changes closed out |
| `cancelled` | CR was declined and will not proceed |

## State Transitions

```
draft → in_review → designing → implementing → completed
                         ↓              ↓
                      cancelled     cancelled
```

Exceptional transition:

- `implementing → designing`
  use only when implementation review reveals that the approved plan is no
  longer valid and the plan spec must be revised

## Automation Gates

### Gate 1: CR Approval

Input:

- approved CR PR in `WebTPS-DHF`

Result:

- AI may begin analysis
- CR status changes from `new` to `analyze`
- AI creates or updates the Plan Spec PR in `WebTPS-DHF`

### Gate 2: Plan Approval

Input:

- approved Plan Spec PR in `WebTPS-DHF`

Result:

- AI may begin implementation
- CR status changes from `analyze` to `developing`
- AI creates or updates the Implementation PR in `WebTPS`

### Gate 3: Implementation Approval

Input:

- approved Implementation PR

Result:

- PRs may be merged by human decision
- CR status changes from `developing` to `completed`

## Review Feedback Handling

### Plan Spec Feedback

If comments are raised on the Plan Spec PR:

- AI must triage each comment
- AI may revise the plan spec directly
- AI must reply to each comment
- AI must not begin implementation until plan approval is explicit

### Implementation Feedback

If comments are raised on the Implementation PR:

- AI must triage each comment
- AI may implement requested fixes directly when they remain within the
  approved plan
- AI must reply to each comment
- if feedback changes scope, architecture, or validation assumptions in a
  meaningful way, AI must return to the Plan Spec PR and revise it

## Repository Responsibility Split

### `WebTPS-DHF`

Owns:

- CR item lifecycle
- CR Spec
- plan-review surface
- DHF traceability items
- formal compliance records

### `WebTPS`

Owns:

- implementation code
- tests
- implementation-review surface
- developer-facing design and process docs

Does not own:

- authoritative CR Spec

## Required Content Per PR

### CR PR

- change summary
- rationale for the requested change
- initial CR status

### Plan Spec PR

- problem statement
- strategy / roadmap fit
- architecture fit
- affected code areas
- expected DHF impact
- validation plan
- open questions and assumptions

### Implementation PR

- implementation summary
- exact DHF files changed, or explicit statement that none were required
- automated validation actually run
- manual testing still required, with concrete steps
- residual risks or follow-up items

## Automation Monitoring Rule

After a Plan Spec PR or Implementation PR is opened, AI is expected to keep
following review comments and CI until the PR is resolved or explicitly handed
off.

Short-interval monitoring is acceptable for an active PR thread, but it should
be scoped to that PR and stopped once the PR is merged, closed, blocked, or
handed off.
