# CR Automation Workflow

## Purpose

This document defines the change-request-driven automation workflow for WebTPS.

The goal is to make AI execution gated, reviewable, and traceable. AI should
not move directly from a user idea to code implementation without explicit
human approval checkpoints.

This workflow spans two repositories:

- `WebTPS-DHF` for the CR item and formal DHF lifecycle
- `WebTPS` for plan specification and implementation work

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

- `WebTPS`

Contents:

- `docs/CRxxx-Spec.md`
- optional supporting documentation updates

Purpose:

- capture AI analysis
- define the proposed implementation plan
- identify impacted areas, DHF impact, architecture impact, validation plan,
  and open questions

Rules:

- created or updated by AI only after the CR PR is approved
- requires human approval before AI implementation begins
- if plan-level review feedback changes scope or approach, AI updates the spec
  and resubmits for review

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

Because the CR item itself is not used as a continuously rich dashboard, the
status model should remain simple:

- `new`
- `analyze`
- `developing`
- `completed`
- `rejected`

## Status Meaning

### `new`

- CR has been created
- no AI analysis has started
- waiting for human approval to enter analysis

### `analyze`

- CR has been approved for analysis
- AI is generating or revising the plan spec
- Plan Spec PR is the active review surface

### `developing`

- Plan Spec PR has been approved
- AI is implementing the approved plan
- Implementation PR is the active review surface

### `completed`

- implementation has been merged
- required DHF changes have been merged or explicitly closed out

### `rejected`

- CR was declined and will not proceed

## State Transitions

Allowed transitions:

- `new -> analyze`
- `analyze -> developing`
- `developing -> completed`
- `new -> rejected`
- `analyze -> rejected`

Exceptional transition:

- `developing -> analyze`
  use only when implementation review reveals that the approved plan is no
  longer valid and the plan spec must be revised

## Automation Gates

### Gate 1: CR Approval

Input:

- approved CR PR in `WebTPS-DHF`

Result:

- AI may begin analysis
- CR status changes from `new` to `analyze`
- AI creates or updates the Plan Spec PR in `WebTPS`

### Gate 2: Plan Approval

Input:

- approved Plan Spec PR in `WebTPS`

Result:

- AI may begin implementation
- CR status changes from `analyze` to `developing`
- AI creates or updates the Implementation PR

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
- DHF traceability items
- formal compliance records

Does not own:

- implementation plan specification
- code review surface for product code

### `WebTPS`

Owns:

- plan specification
- implementation code
- tests
- developer-facing design and process docs

Does not replace:

- formal DHF traceability responsibilities that remain in `WebTPS-DHF`

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
