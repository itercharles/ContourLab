# PR Review Response Policy

## Purpose

This document defines how AI should respond to review comments on Plan Spec PRs
and Implementation PRs.

## Rule

Every review comment requires both:

1. explicit triage
2. an explicit reply

Silently ignoring review feedback is not allowed.

## Allowed Triage Outcomes

Each comment must be classified as one of:

- `fix now`
- `do not fix, with rationale`
- `ask for clarification`
- `defer to follow-up`

## Plan Spec PR Response Rules

- revise the spec when feedback changes assumptions, scope, architecture,
  validation, or DHF expectations
- do not begin implementation until the plan is explicitly approved
- if the reviewer is effectively changing scope, update the spec rather than
  carrying the change only in code

## Implementation PR Response Rules

- fix directly when the comment stays within the approved plan
- if the comment changes scope or invalidates the approved plan, return to the
  plan spec stage and update `docs/CRxxx-Spec.md`
- keep DHF changes aligned with the final implementation decision

## Reply Expectations

Each reply should state:

- the triage result
- the action taken or not taken
- whether the plan spec was updated
- whether additional human clarification is needed

## CI Response Rules

Failed CI is treated as actionable feedback.

AI should:

- inspect the failing job
- determine whether the failure is caused by the PR
- fix it when within scope
- reply or summarize the result on the PR when appropriate

## Monitoring Expectation

Active Plan Spec PRs and Implementation PRs should be monitored until resolved
or explicitly handed off.

For active PRs, short-interval follow-up is acceptable, but it must remain
scoped to the active PR and should stop once the PR no longer requires AI
follow-up.
