# Spec-In-DHF Migration

## Purpose

This document records the repository-boundary correction for CR-driven
automation:

- `CR` items remain in `WebTPS-DHF`
- `CR Spec` also moves to `WebTPS-DHF`
- `WebTPS` owns implementation only

This is the current target model.

## Why The Boundary Changed

The earlier scaffold placed the CR in `WebTPS-DHF` but placed the Plan Spec PR
in `WebTPS`. That increased complexity in four ways:

1. Stage 1 required cross-repository PR creation
2. CR and Spec review happened in different repositories
3. state synchronization started too early in the workflow
4. reviewers had to move between repositories before implementation existed

Keeping `CR + Spec` together in `WebTPS-DHF` reduces the automation surface and
makes review intent clearer.

## Target Repository Split

### `WebTPS-DHF`

Owns:

- CR item
- CR status labels
- CR Spec document
- Stage 1 analysis automation
- Plan Spec review follow-up
- pre-implementation approval gate

Recommended spec path:

- `docs/cr-specs/CRxxx-Spec.md`

### `WebTPS`

Owns:

- Stage 2 implementation automation
- implementation branch and PR
- code changes
- tests
- implementation review follow-up
- optional implementation-adjacent documentation

Does not own:

- authoritative CR Spec
- Stage 1 plan generation
- plan-review approval state

## Resulting Stage Topology

### Stage 1

- source repo: `WebTPS-DHF`
- input: approved `CR PR`
- output: `Plan Spec PR` in `WebTPS-DHF`

### Stage 2

- source repo: `WebTPS-DHF`
- input: approved `Plan Spec PR`
- output: `Implementation PR` in `WebTPS`

### Stage 3

- source repo: `WebTPS`
- input: implementation review feedback and CI
- output: implementation updates, replies, or explicit replan signal

### Stage 4

- source repo: `WebTPS`
- input: merged implementation PR
- output: CR completion sync in `WebTPS-DHF`

## Impact On Existing WebTPS Scaffolds

The following files in `WebTPS` are now transitional and must not be extended
as if they were the final Stage 1 solution:

- `.github/workflows/cr-stage1-plan-spec.yml`
- `.github/workflows/plan-pr-follow-up.yml`
- `scripts/automation/stage1-plan-spec.mjs`

Until matching automation exists in `WebTPS-DHF`, those files may remain for
reference or temporary dry-run use, but they are no longer the target design.

## Required Follow-Up

1. move authoritative Stage 1 automation into `WebTPS-DHF`
2. move authoritative Plan PR follow-up into `WebTPS-DHF`
3. treat Stage 2 entry in `WebTPS` as a dispatch from approved DHF plan review
4. keep completion sync in `WebTPS` because merge completion still originates
   from the implementation repository
