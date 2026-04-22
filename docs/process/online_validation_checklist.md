# Online Validation Checklist

## Purpose

This checklist defines the first online validation steps for the CR-driven
automation workflows.

## Stage 0: Label Baseline

- run label reconcile in dry-run mode
- run label reconcile in apply mode
- confirm required labels exist in `WebTPS`
- confirm equivalent labels exist in `WebTPS-DHF`

## Stage 1: Plan Spec Automation

- create a disposable CR in `WebTPS-DHF`
- apply `pr:cr`, `cr:new`, `ai:ready`
- obtain an approved review from an authorized approver
- trigger Stage 1
- confirm:
  - Plan Spec branch is created
  - Plan Spec PR is created
  - `cr:new -> cr:analyze` sync occurs in `WebTPS-DHF`

## Stage 2: Implementation Automation

- approve the disposable Plan Spec PR
- trigger Stage 2
- confirm:
  - implementation kickoff doc is created
  - implementation branch is created
  - draft implementation PR is created
  - `cr:analyze -> cr:developing` sync occurs in `WebTPS-DHF`

## Follow-up Validation

- add a human comment on the Plan Spec PR
- confirm `ai:needs-human` appears
- add a review with `CHANGES_REQUESTED` on the implementation PR
- confirm `ai:replan` appears

## Completion Validation

- merge a disposable implementation PR
- confirm completion sync updates the linked DHF CR to `cr:completed`

## Failure Handling Check

- add `ai:blocked` to an active PR
- confirm the workflow no longer proceeds on that PR

## Exit Condition

The workflows should not be considered production-ready until each of the above
checks has been run successfully at least once on disposable test PRs.
