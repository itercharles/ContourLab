# Automation Scaffolds

This document describes the current state of all CR-driven automation scaffolds
in `WebTPS`. The repository split is:

- `WebTPS-DHF` owns: CR item, CR Spec, Stage 1 analysis, plan review
- `WebTPS` owns: Stage 2 implementation, implementation review follow-up,
  completion sync

## Stage 1 Scaffold (Legacy — Transitional Only)

**Script:** `scripts/automation/stage1-plan-spec.mjs`  
**Workflow:** `.github/workflows/cr-stage1-plan-spec.yml`

Stage 1 has been migrated to `WebTPS-DHF`. These files remain only as a
temporary dry-run reference and must not be extended as the long-term Stage 1
implementation. Use `manual_bypass=true` for any legacy dry-run use.

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
  "authorizedApprovers": ["reviewer-login"]
}
```

Retire these files once the DHF-side Stage 1 workflow is proven online.

## Plan PR Follow-up Scaffold (Transitional Only)

**Workflow:** `.github/workflows/plan-pr-follow-up.yml`

Plan Spec review now belongs in `WebTPS-DHF`. This workflow runs via
`workflow_dispatch` only, inspects a manually specified legacy Plan PR in
`WebTPS`, and adds `ai:needs-human` when human feedback is present. Do not
extend it.

## Stage 2 Scaffold

**Script:** `scripts/automation/stage2-implementation-pr.mjs`  
**Workflow:** `.github/workflows/cr-stage2-implementation.yml`

**Triggers:** `workflow_dispatch`, `repository_dispatch` with event type `plan-approved`

Guard contract (normal automation payloads):

- `prTypeLabel == pr:plan`
- `crStatusLabel == cr:analyze`
- `aiControlLabel == ai:ready`
- `blocked == false`
- `hasHumanApproval == true`
- `approvalActor` and `authorizedApprovers` present

`planPrUrl` and `planPullNumber` refer to the approved Plan Spec PR in
`WebTPS-DHF`, not a PR in `WebTPS`.

Current behavior: validates payload, verifies the Plan PR in `WebTPS-DHF` via
GitHub API when `planPullNumber` is provided, generates an implementation
kickoff document, creates or updates a draft implementation PR, and optionally
mirrors CR state to `cr:developing`.

Not yet implemented: actual code changes from the approved plan, parallel DHF
implementation PR, implementation review comment processing, automatic
validation output in PR body.

## Implementation PR Follow-up Scaffold

**Workflow:** `.github/workflows/implementation-pr-follow-up.yml`

Reacts to new comments and reviews (and optionally a schedule). Current
behavior:

- adds `ai:needs-human` when human-originated feedback is present
- adds `ai:replan` when review state includes `CHANGES_REQUESTED`
- creates or updates a structured bot follow-up comment
- removes labels when the corresponding condition clears

Not yet implemented: autonomous code patching, semantic scope-change detection
beyond `CHANGES_REQUESTED`.

## Completion Sync Scaffold

**Workflow:** `.github/workflows/cr-completion-sync.yml`

Reacts to merged PR closure events. Current behavior:

- verifies the merged PR is an implementation PR
- parses the linked CR PR URL from the implementation PR body
- updates the linked DHF CR labels from `cr:developing` to `cr:completed`
- comments on the DHF CR with the implementation PR URL

Not yet implemented: multi-DHF-PR verification, CI policy layer, plan PR label
close-out.
