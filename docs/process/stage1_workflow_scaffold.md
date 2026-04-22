# Stage 1 Workflow Scaffold

## Purpose

This document describes the legacy Stage 1 scaffold that still exists in
`WebTPS`:

- approved CR input
- plan spec scaffold generation

It is no longer the target architecture. The authoritative Stage 1 workflow now
belongs in `WebTPS-DHF` because both the CR item and the CR Spec are owned
there.

## Legacy Pieces Currently Present In `WebTPS`

### 1. Plan spec generator script

Script:

- `scripts/automation/stage1-plan-spec.mjs`

Historical behavior:

- validates a CR payload
- requires `crId`, `title`, and `crPrUrl`
- writes or updates a local Plan Spec scaffold
- uses the approved plan spec structure from
  [plan_spec_template.md](plan_spec_template.md)

### 2. Legacy GitHub Actions scaffold

Workflow:

- `.github/workflows/cr-stage1-plan-spec.yml`

Supported triggers:

- `workflow_dispatch`

Current behavior:

- requires `manual_bypass=true`
- remains available only as a temporary dry-run reference
- demonstrates payload validation and branch/PR scaffolding logic
- must not be extended as the long-term Stage 1 implementation

## Current Status

Stage 1 should be migrated into `WebTPS-DHF`.

The `WebTPS` copies of:

- `scripts/automation/stage1-plan-spec.mjs`
- `.github/workflows/cr-stage1-plan-spec.yml`

should be treated as transitional only.

## Why This Scaffold Is No Longer Authoritative

The corrected repository split is:

- `WebTPS-DHF`: CR item, CR Spec, Stage 1 analysis, Plan PR follow-up
- `WebTPS`: implementation only

Keeping Stage 1 in `WebTPS` would recreate unnecessary cross-repository
orchestration at the wrong point in the workflow.

## Current Limitations

This scaffold does **not** represent the intended future implementation.

Its remaining value is:

- reference payload shape
- local dry-run testing
- migration aid while the authoritative DHF-side workflow is built

## Historical Payload Contract

Minimum payload:

```json
{
  "crId": "CR-123",
  "title": "Short title",
  "crPrUrl": "https://github.com/org/WebTPS-DHF/pull/123",
  "prTypeLabel": "pr:cr",
  "crStatusLabel": "cr:new",
  "aiControlLabel": "ai:ready",
  "blocked": false,
  "hasHumanApproval": true,
  "approvalActor": "reviewer-login",
  "authorizedApprovers": ["reviewer-login", "backup-reviewer"]
}
```

Payload for optional DHF status sync:

```json
{
  "crId": "CR-123",
  "title": "Short title",
  "crPrUrl": "https://github.com/org/WebTPS-DHF/pull/123",
  "dhfRepoOwner": "org",
  "dhfRepoName": "WebTPS-DHF",
  "crPullNumber": 123
}
```

The same DHF repository fields also enable live GitHub API verification when
`WEBTPS_AUTOMATION_TOKEN` is available to the workflow during a legacy manual
dry-run.

Optional fields:

- `status`
- `problemStatement`
- `productFit`
- `outOfScope`
- `architectureFit`
- `adrDecision`
- `proposedImplementation`
- `affectedRepositories`
- `affectedWorkspaces`
- `likelyFiles`
- `dhfImpact`
- `automatedValidation`
- `manualValidation`
- `acceptanceSignals`
- `risks`
- `openQuestions`
- `implementationPrUrl`
- `implementationExitCriteria`
- `completionExitCriteria`

## Local Usage

Example:

```bash
pnpm automation:stage1:plan-spec --payload '{"crId":"CR-123","title":"Example","crPrUrl":"https://github.com/example/WebTPS-DHF/pull/123"}'
```

Manual runs must explicitly set `manual_bypass=true`. That switch exists only
for legacy scaffold debugging and should not be used for normal CR automation.

Validation-only example:

```bash
pnpm automation:stage1:plan-spec --payload '{"crId":"CR-123","title":"Example","crPrUrl":"https://github.com/example/WebTPS-DHF/pull/123"}' --check
```

Temporary output example:

```bash
pnpm automation:stage1:plan-spec --payload '{"crId":"CR-123","title":"Example","crPrUrl":"https://github.com/example/WebTPS-DHF/pull/123"}' --output-dir /tmp/webtps-stage1-spec
```

## Required Follow-Up

1. move authoritative Stage 1 automation into `WebTPS-DHF`
2. move authoritative Plan PR follow-up into `WebTPS-DHF`
3. keep only Stage 2 and later automation in `WebTPS`
4. retire or clearly mark the local Stage 1 scaffold after DHF-side migration
