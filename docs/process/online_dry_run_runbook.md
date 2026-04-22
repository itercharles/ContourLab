# Online Dry-Run Runbook

## Purpose

This runbook defines the first controlled online dry-run for the CR-driven
automation workflows.

It is intended for a disposable test CR, not for a production-facing change.

## Goal

Verify that the GitHub-side automation wiring behaves correctly before the
workflows are used for real delivery.

## Preconditions

Before starting:

1. labels are reconciled in `WebTPS`
2. equivalent labels exist in `WebTPS-DHF`
3. `WEBTPS_AUTOMATION_TOKEN` is configured in `WebTPS`
4. branch protection is enabled on `main`
5. the test reviewers are listed in `authorizedApprovers`

Reference:

- [automation_enablement.md](automation_enablement.md)
- [online_validation_checklist.md](online_validation_checklist.md)

## Dry-Run Scope

Use one disposable CR only.

Do not use:

- a real product change
- a real release branch
- a critical compliance item

## Stage A: Label Baseline

In `WebTPS`:

1. run `.github/workflows/reconcile-labels.yml` with `apply=false`
2. inspect the dry-run output
3. run the same workflow with `apply=true`

In `WebTPS-DHF`:

1. manually create equivalent labels, or use an equivalent reconcile process
2. verify `pr:*`, `cr:*`, and `ai:*` labels exist

## Stage B: Disposable CR Creation

In `WebTPS-DHF`:

1. create a disposable CR PR
2. apply labels:
   - `pr:cr`
   - `cr:new`
   - `ai:ready`
3. ensure `ai:blocked` is not present
4. get an approved review from an authorized reviewer

## Stage C: Stage 1 Trigger

Preferred method:

- trigger `repository_dispatch` with the Stage 1 payload

Fallback method:

- run `.github/workflows/cr-stage1-plan-spec.yml` with `workflow_dispatch`
- use `manual_bypass=true` only for workflow debugging, not for real gate
  validation

Expected result:

1. `codex/cr-XXX-plan` branch is created in `WebTPS`
2. `docs/CRxxx-Spec.md` is created or updated
3. a Plan Spec PR is created or updated
4. the linked CR in `WebTPS-DHF` moves from `cr:new` to `cr:analyze`

## Stage D: Stage 2 Trigger

In `WebTPS`:

1. approve the disposable Plan Spec PR with an authorized reviewer
2. ensure labels are:
   - `pr:plan`
   - `cr:analyze`
   - `ai:ready`
3. trigger Stage 2 with the Stage 2 payload

Expected result:

1. `codex/cr-XXX-impl` branch is created
2. `docs/CRxxx-Implementation.md` is created or updated
3. a draft Implementation PR is created or updated
4. the linked CR in `WebTPS-DHF` moves from `cr:analyze` to `cr:developing`

## Stage E: Follow-up Validation

Plan PR:

1. add a human comment
2. confirm `ai:needs-human` appears

Implementation PR:

1. add a human comment
2. confirm `ai:needs-human` appears
3. submit `CHANGES_REQUESTED`
4. confirm `ai:replan` appears

## Stage F: Completion Validation

1. merge the disposable Implementation PR
2. confirm `.github/workflows/cr-completion-sync.yml` runs
3. confirm the linked DHF CR moves from `cr:developing` to `cr:completed`

## Failure Signals

Stop the dry-run if any of these occur:

1. wrong PR type receives automation
2. blocked PR still advances
3. unauthorized reviewer approval advances a stage
4. DHF status sync updates the wrong CR
5. completion sync fires for a non-implementation PR

## Immediate Rollback

If the dry-run misbehaves:

1. add `ai:blocked` to the affected PR
2. disable the relevant GitHub workflow
3. remove or rotate `WEBTPS_AUTOMATION_TOKEN` if cross-repo actions are unsafe
4. continue manually until the cause is understood

## Success Criteria

The dry-run is considered successful only if:

1. Stage 1 gate behaves correctly
2. Stage 2 gate behaves correctly
3. follow-up labels appear on the correct PRs
4. completion sync updates the correct CR
5. no unintended repository mutation occurs outside the disposable test flow
