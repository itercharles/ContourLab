# Plan PR Follow-up Scaffold

## Purpose

This document describes the legacy follow-up scaffold for active Plan Spec PRs
that still exists in `WebTPS`.

## Workflow

- `.github/workflows/plan-pr-follow-up.yml`

## Current Status

Plan Spec review now belongs in `WebTPS-DHF`, because the authoritative
Plan Spec PR also belongs there.

This scaffold should therefore be treated as transitional only.

## Current Behavior

- runs only through `workflow_dispatch`
- inspects a manually specified legacy Plan PR in `WebTPS`
- summarizes comment and review state
- adds `ai:needs-human` when human-originated feedback is present

## Limitations

This scaffold does **not yet**:

- triage comments semantically
- reply to comments automatically
- revise the plan spec automatically
- distinguish actionable comments from informational comments

## Role In The System

This workflow is no longer the target design for plan follow-up. The target
behavior is:

- Plan PR follow-up in `WebTPS-DHF`
- Implementation PR follow-up in `WebTPS`
