# Automation Enablement

## Purpose

This document defines the minimum setup required before the CR-driven
automation workflows can be enabled safely in GitHub.

It is an operational enablement document, not a design document.

## Repositories

This setup spans:

- `WebTPS`
- `WebTPS-DHF`

## Minimum Prerequisites

Before enabling automation, confirm:

1. label baseline is reconciled in both repositories
2. the required secrets are configured
3. branch protection is enabled on protected branches
4. authorized approver policy is agreed
5. repository dispatch payload contract is understood
6. the corrected repository split is understood:
   - `WebTPS-DHF` owns `CR + Spec`
   - `WebTPS` owns implementation

## Required Secrets

### In `WebTPS`

#### `WEBTPS_AUTOMATION_TOKEN`

Purpose:

- verify DHF PR state through GitHub API
- consume approved Plan Spec state from `WebTPS-DHF`
- update DHF CR labels and comments
- completion synchronization back to `WebTPS-DHF`

Expected scope:

- access to `WebTPS`
- access to `WebTPS-DHF`
- permission to read PRs and write issue comments / labels

Recommended implementation:

- GitHub App token or fine-grained PAT

Do not use a broad personal token if a narrower option is available.

## Label Initialization

Run the label reconcile workflow before using implementation-side automation.

Required source:

- [`.github/labels.json`](/Users/charles/Code/WebTPS/.github/labels.json)

Workflow:

- [reconcile-labels.yml](/Users/charles/Code/WebTPS/.github/workflows/reconcile-labels.yml)

Recommended sequence:

1. dry-run in `WebTPS`
2. apply in `WebTPS`
3. mirror equivalent labels in `WebTPS-DHF`

## Branch Protection Recommendations

Protect at least:

- `main`

Recommended rules:

- require pull request before merge
- require review approval before merge
- require status checks to pass
- restrict direct pushes

For CR-driven automation, do not allow automated workflows to merge directly to
`main`.

## Authorized Approver Setup

Current automation supports:

- explicit `authorizedApprovers`
- optional `authorizedTeams`
- optional `requireCodeownerApproval`

Before enabling automation, decide:

- who is allowed to approve CR PRs
- who is allowed to approve Plan Spec PRs
- whether the same reviewers are allowed for both stages
- whether team-based approval is required
- whether CODEOWNERS-aligned approval should be enforced

Recommended operational source:

- `WebTPS-DHF` repository variables for Stage 1 / plan approval gates
- explicit dispatch payload for the cross-repository Stage 2 handoff

## Repository Dispatch Payload Contracts

### Stage 1

Stage 1 is now owned by `WebTPS-DHF`.

The payload below is included here only as the cross-repository contract that
the rest of the system expects.

Required baseline fields:

```json
{
  "crId": "CR-123",
  "title": "Example title",
  "crPrUrl": "https://github.com/org/WebTPS-DHF/pull/123",
  "prTypeLabel": "pr:cr",
  "crStatusLabel": "cr:new",
  "aiControlLabel": "ai:ready",
  "blocked": false,
  "hasHumanApproval": true,
  "approvalActor": "reviewer-login",
  "authorizedApprovers": ["reviewer-login"],
  "authorizedTeams": ["org/reviewers"],
  "dhfRepoOwner": "org",
  "dhfRepoName": "WebTPS-DHF",
  "crPullNumber": 123
}
```

Example payload file:

- [payload_examples/stage1-repository-dispatch.json](payload_examples/stage1-repository-dispatch.json)

### Stage 2

Required baseline fields:

```json
{
  "crId": "CR-123",
  "title": "Example title",
  "crPrUrl": "https://github.com/org/WebTPS-DHF/pull/123",
  "planPrUrl": "https://github.com/org/WebTPS-DHF/pull/456",
  "planPullNumber": 456,
  "prTypeLabel": "pr:plan",
  "crStatusLabel": "cr:analyze",
  "aiControlLabel": "ai:ready",
  "blocked": false,
  "hasHumanApproval": true,
  "approvalActor": "reviewer-login",
  "authorizedApprovers": ["reviewer-login"],
  "authorizedTeams": ["org/reviewers"],
  "requireCodeownerApproval": true,
  "dhfRepoOwner": "org",
  "dhfRepoName": "WebTPS-DHF",
  "crPullNumber": 123
}
```

Example payload file:

- [payload_examples/stage2-repository-dispatch.json](payload_examples/stage2-repository-dispatch.json)

## Recommended Enablement Sequence

1. reconcile labels
2. configure `WEBTPS_AUTOMATION_TOKEN`
3. enable branch protection on `main`
4. test Stage 1 with `workflow_dispatch` and `manual_bypass=true`
5. test Stage 1 with a real payload and live DHF PR verification
6. test Stage 2 with a real approved Plan PR in `WebTPS-DHF`
7. test follow-up workflows on non-critical PRs
8. test completion sync on a disposable CR

## Safe Rollout Recommendation

Enable in this order:

1. Stage 1 enablement in `WebTPS-DHF`
2. Stage 2 live verification in `WebTPS`
3. implementation follow-up workflows
4. completion sync

Do not enable all workflows at once without a dry-run phase.

## Operational Rollback

If automation behaves incorrectly:

1. add `ai:blocked` to affected PRs
2. disable the relevant GitHub workflow
3. remove or rotate `WEBTPS_AUTOMATION_TOKEN` if needed
4. return to manual PR handling until root cause is understood
# CR automation smoke test - safe to delete
