# Reviewer Authorization Policy

## Purpose

This document defines who is allowed to approve automated stage transitions in
the CR-driven workflow.

Automation must not treat every GitHub approval as equivalent. Stage
transitions require approval from an authorized human reviewer.

## Scope

This policy applies to:

- Stage 1: CR PR approval -> Plan Spec PR creation
- Stage 2: Plan Spec PR approval -> Implementation PR creation
- future stage transitions that depend on human approval

## Authorization Principle

An approval is valid for automation only if:

1. the review state is currently `APPROVED`
2. the approval comes from a human reviewer
3. the reviewer is authorized for the stage

## Supported Authorization Models

### 1. Explicit user allowlist

Current baseline support:

- `authorizedApprovers`

This is the preferred machine-readable control for the current automation
baseline.

Example:

```json
{
  "authorizedApprovers": ["alice", "bob"]
}
```

At least one active `APPROVED` review must come from a reviewer listed in
`authorizedApprovers`.

### 2. Team-based authorization

Supported:

- organization team allowlists

When configured, an active approval is valid if the reviewer is a member of an
authorized team.

### 3. CODEOWNERS-aligned authorization

Supported:

- optional CODEOWNERS-aware approval enforcement

When enabled, automation additionally requires at least one active approval
from a reviewer who matches a user or team owner for the changed files.

## Review State Rules

Only the latest review state from a given reviewer counts.

Examples:

- `COMMENTED` after `APPROVED` cancels that reviewer's active approval
- `CHANGES_REQUESTED` after `APPROVED` cancels that reviewer's active approval
- only the final review state per reviewer should be evaluated

## Stage Requirements

### Stage 1

At least one active approved review must come from an authorized reviewer for
the CR PR in `WebTPS-DHF`.

### Stage 2

At least one active approved review must come from an authorized reviewer for
the Plan Spec PR in `WebTPS-DHF`.

Current scaffold support:

- `authorizedApprovers` allowlist
- `authorizedTeams`
- optional CODEOWNERS-derived approval enforcement

## Payload Contract

When automation is triggered through payload-based dispatch, include:

```json
{
  "authorizedApprovers": ["alice", "bob"],
  "authorizedTeams": ["org/reviewers"],
  "requireCodeownerApproval": true
}
```

At least one explicit authorization path must be configured. Omitted reviewer
policy should be treated as an error, not as implicit approval.

## Manual Bypass

Manual bypass is for scaffold debugging only.

It must not be used to simulate reviewer authorization in normal workflow
execution.
