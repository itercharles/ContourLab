# Stage 2 Workflow Scaffold

## Purpose

This document describes the current implementation scaffold for Stage 2:

- approved Plan Spec input
- implementation kickoff branch and PR generation

It is intentionally narrower than the full implementation automation target.

## Implemented Pieces

### 1. Implementation kickoff generator script

Script:

- `scripts/automation/stage2-implementation-pr.mjs`

Behavior:

- validates a Stage 2 payload
- requires `crId`, `title`, `crPrUrl`, and `planPrUrl`
- writes or updates `docs/CRxxx-Implementation.md`

### 2. GitHub Actions scaffold

Workflow:

- `.github/workflows/cr-stage2-implementation.yml`

Supported triggers:

- `workflow_dispatch`
- `repository_dispatch` with event type `plan-approved`

Current behavior:

- resolves the incoming payload
- enforces Stage 2 guard checks on normal automation payloads
- verifies the Plan PR through the GitHub API when `planPullNumber` is provided
- generates an implementation kickoff document
- creates or updates a draft implementation PR
- optionally mirrors the CR state to `cr:developing` in `WebTPS-DHF`

## Guard Contract

Normal automation payloads must include:

- `prTypeLabel == pr:plan`
- `crStatusLabel == cr:analyze`
- `aiControlLabel == ai:ready`
- `blocked == false`
- `hasHumanApproval == true`
- `approvalActor`
- `authorizedApprovers`

## Limitations

This scaffold does **not yet**:

- implement the actual code changes from the approved plan
- open a parallel DHF implementation PR automatically
- process implementation review comments
- update implementation PR body with real validation output automatically

## Next Steps

1. add implementation review follow-up automation
2. wire actual implementation execution into the implementation branch
3. open linked DHF implementation PRs when required
4. add completion synchronization for `developing -> completed`
