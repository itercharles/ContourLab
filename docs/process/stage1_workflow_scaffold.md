# Stage 1 Workflow Scaffold

## Purpose

This document describes the current implementation scaffold for Stage 1:

- approved CR input
- plan spec scaffold generation

It is intentionally narrower than the full automation design. The current goal
is to establish a deterministic entry point and payload contract before adding
cross-repository PR creation and review orchestration.

## Implemented Pieces

### 1. Plan spec generator script

Script:

- `scripts/automation/stage1-plan-spec.mjs`

Behavior:

- validates a CR payload
- requires `crId`, `title`, and `crPrUrl`
- writes or updates `docs/CRxxx-Spec.md`
- uses the approved plan spec structure from
  [plan_spec_template.md](plan_spec_template.md)

### 2. GitHub Actions scaffold

Workflow:

- `.github/workflows/cr-stage1-plan-spec.yml`

Supported triggers:

- `workflow_dispatch`
- `repository_dispatch` with event type `cr-approved`

Current behavior:

- checks out the repository
- installs dependencies
- resolves the incoming payload
- generates or updates a plan spec scaffold
- creates or updates a Plan Spec branch
- commits the generated spec change when needed
- creates or updates a Plan Spec PR in `WebTPS`
- optionally mirrors the CR state to `cr:analyze` in `WebTPS-DHF` when
  cross-repository credentials and payload fields are provided
- enforces Stage 1 guard checks on normal automation payloads:
  - `prTypeLabel == pr:cr`
  - `crStatusLabel == cr:new`
  - `aiControlLabel == ai:ready`
  - `blocked == false`
  - `hasHumanApproval == true`
  - `approvalActor` present
  - `authorizedApprovers` present
- when `WEBTPS_AUTOMATION_TOKEN` and DHF PR coordinates are provided, performs
  live GitHub API verification of the DHF PR before continuing

## Current Limitations

This scaffold does **not yet**:

- create cross-repository links beyond comment/URL propagation
- enforce the full label guard model from the GitHub automation design beyond
  the minimum Stage 1 payload contract
- open an implementation PR
- independently verify reviewer authorization beyond the presence of an
  approved review

Those are deliberate next steps, not omissions.

## Payload Contract

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
`WEBTPS_AUTOMATION_TOKEN` is available to the workflow.

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

Manual debug runs may bypass guard fields only through the GitHub workflow
input `manual_bypass=true`. That bypass is for scaffold debugging only and
should not be used for normal CR automation.

Validation-only example:

```bash
pnpm automation:stage1:plan-spec --payload '{"crId":"CR-123","title":"Example","crPrUrl":"https://github.com/example/WebTPS-DHF/pull/123"}' --check
```

Temporary output example:

```bash
pnpm automation:stage1:plan-spec --payload '{"crId":"CR-123","title":"Example","crPrUrl":"https://github.com/example/WebTPS-DHF/pull/123"}' --output-dir /tmp/webtps-stage1-spec
```

## Next Steps

1. enforce approval and label guards matching
   [github_automation_design.md](github_automation_design.md)
2. harden reviewer-authorization checks beyond generic approved reviews
3. add Plan Spec PR review-follow-up automation
4. create the Stage 2 implementation workflow
