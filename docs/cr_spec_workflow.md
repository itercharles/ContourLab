# CR And Spec Workflow

## Purpose

This document defines the CR-driven workflow owned by `WebTPS-DHF`.

`WebTPS-DHF` is the source of truth for:

- CR item lifecycle
- CR status labels
- CR Spec document
- Stage 1 analysis and plan review

`WebTPS` is the source of truth for:

- implementation branch and PR
- product code and tests
- implementation review follow-up

## Repository Split

### `WebTPS-DHF`

Owns:

- `CR PR`
- `Plan Spec PR`
- `docs/cr-specs/CRxxx-Spec.md`
- `planned -> in_review -> designing -> implementing -> completed` CR states

### `WebTPS`

Owns:

- `Implementation PR`
- implementation code and tests
- completion-driven sync back to the DHF CR

## PR Topology

1. `CR PR` in `WebTPS-DHF`
2. `Plan Spec PR` in `WebTPS-DHF`
3. `Implementation PR` in `WebTPS`

## State Model

Allowed CR states:

- `planned`
- `in_review`
- `designing`
- `implementing`
- `completed`
- `cancelled`

The normal flow is:

- `planned -> in_review`
- `in_review -> designing`
- `designing -> implementing`
- `implementing -> completed`

Exceptional return:

- `implementing -> designing`
  use only when implementation feedback invalidates the approved plan and the
  spec must be revised.

## Stage Ownership

### Stage 1

- source repo: `WebTPS-DHF`
- input: approved `CR PR`
- output: approved `Plan Spec PR`

### Stage 2

- source repo: `WebTPS-DHF`
- input: approved `Plan Spec PR`
- output: `Implementation PR` in `WebTPS`

### Stage 3

- source repo: `WebTPS`
- input: implementation review feedback and CI
- output: implementation updates or explicit replan signal

### Stage 4

- source repo: `WebTPS`
- input: merged implementation PR
- output: CR completion sync in `WebTPS-DHF`


## Runtime Prerequisites

`WebTPS-DHF` workflow runtime requires:

- repository variables `CR_ANALYZE_MODEL` and `CR_DESIGN_MODEL`
- secret `ANTHROPIC_API_KEY`
- secret `PRODUCT_REPO_TOKEN` with access to both repositories

`WebTPS` workflow runtime requires:

- repository variable `CR_DEVELOP_MODEL`
- secrets `ANTHROPIC_API_KEY` and `PRODUCT_REPO_TOKEN`
