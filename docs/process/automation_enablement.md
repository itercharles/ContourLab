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

## Required Secrets

### In `WebTPS`

#### `WEBTPS_AUTOMATION_TOKEN`

Purpose:

- verify DHF PR state through GitHub API
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

Run the label reconcile workflow before using Stage 1 / Stage 2 automation.

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

Current scaffold supports:

- explicit `authorizedApprovers` allowlist in payloads

Before enabling automation, decide:

- who is allowed to approve CR PRs
- who is allowed to approve Plan Spec PRs
- whether the same reviewers are allowed for both stages

Future work may replace this with team-based authorization, but the current
workflow assumes explicit allowlists.

## Repository Dispatch Payload Contracts

### Stage 1

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
  "dhfRepoOwner": "org",
  "dhfRepoName": "WebTPS-DHF",
  "crPullNumber": 123
}
```

### Stage 2

Required baseline fields:

```json
{
  "crId": "CR-123",
  "title": "Example title",
  "crPrUrl": "https://github.com/org/WebTPS-DHF/pull/123",
  "planPrUrl": "https://github.com/org/WebTPS/pull/456",
  "planPullNumber": 456,
  "prTypeLabel": "pr:plan",
  "crStatusLabel": "cr:analyze",
  "aiControlLabel": "ai:ready",
  "blocked": false,
  "hasHumanApproval": true,
  "approvalActor": "reviewer-login",
  "authorizedApprovers": ["reviewer-login"],
  "dhfRepoOwner": "org",
  "dhfRepoName": "WebTPS-DHF",
  "crPullNumber": 123
}
```

## Recommended Enablement Sequence

1. reconcile labels
2. configure `WEBTPS_AUTOMATION_TOKEN`
3. enable branch protection on `main`
4. test Stage 1 with `workflow_dispatch` and `manual_bypass=true`
5. test Stage 1 with a real payload and live DHF PR verification
6. test Stage 2 with a real approved Plan PR
7. test follow-up workflows on non-critical PRs
8. test completion sync on a disposable CR

## Safe Rollout Recommendation

Enable in this order:

1. dry-run and scaffold generation only
2. Stage 1 live verification
3. Stage 2 live verification
4. follow-up workflows
5. completion sync

Do not enable all workflows at once without a dry-run phase.

## Operational Rollback

If automation behaves incorrectly:

1. add `ai:blocked` to affected PRs
2. disable the relevant GitHub workflow
3. remove or rotate `WEBTPS_AUTOMATION_TOKEN` if needed
4. return to manual PR handling until root cause is understood
