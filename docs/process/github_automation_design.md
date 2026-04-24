# GitHub Automation Design

## Purpose

This document defines how the CR-driven workflow should be mapped onto GitHub
events, approvals, labels, and automation actions.

It is a design document for automation behavior. It does not itself implement
the workflows.

Use this document together with:

- [CR automation workflow](cr_automation_workflow.md)
- [Plan spec template](plan_spec_template.md)
- [PR review response policy](pr_review_response_policy.md)
- [Reviewer authorization policy](reviewer_authorization_policy.md)

## Design Goals

The automation design must provide:

1. explicit human gates
2. deterministic event handling
3. clear repository ownership
4. auditable state transitions
5. scoped PR follow-up instead of uncontrolled background automation

## Non-Goals

This design does not yet define:

- auto-merge
- multi-agent parallel implementation
- production deployment automation
- arbitrary natural-language command parsing

Those may be added later through ADRs and follow-on process updates.

## Repositories

### `WebTPS-DHF`

Owns:

- CR PR creation
- CR state transitions
- Plan Spec PR
- Stage 1 analysis automation
- Plan Spec review follow-up
- DHF traceability updates

### `WebTPS`

Owns:

- Implementation PR
- code, tests, and developer-facing docs

## PR Types

Automation must recognize exactly three PR types:

1. `cr`
2. `plan`
3. `implementation`

PR type should be explicit and machine-readable.

## Recommended Signaling Model

Use labels as the primary automation signal. Use review approval as the
secondary gate. Use PR comments only for explicit operator commands.

### Required Labels

Machine-readable definitions live in `.github/labels.json`. Apply via
`.github/workflows/reconcile-labels.yml` (run with `apply=true`). When adding,
removing, or renaming labels, update `.github/labels.json` and any workflows
that depend on the label.

#### PR type labels

- `pr:cr`
- `pr:plan`
- `pr:implementation`

Exactly one PR type label must be present.

#### Status labels

- `cr:new`
- `cr:analyze`
- `cr:developing`
- `cr:completed`
- `cr:rejected`

These mirror the CR state model. For the CR PR, the status label should match
the CR item status. For related Plan Spec and Implementation PRs, the label is
used as a convenience mirror of the active CR state.

#### Control labels

- `ai:ready`
- `ai:blocked`
- `ai:needs-human`
- `ai:replan`

Meaning:

- `ai:ready`: automation may proceed when gate conditions are satisfied
- `ai:blocked`: automation must stop until a human explicitly unblocks it
- `ai:needs-human`: automation determined that human clarification is required
- `ai:replan`: implementation must return to plan-spec revision

## Approval Gates

Automation should never treat labels alone as sufficient to advance a stage.
Each stage requires both:

1. the correct labels
2. at least one explicit human approval on the relevant PR

Approvals must also satisfy
[reviewer_authorization_policy.md](reviewer_authorization_policy.md).

## Event Model

### Stage 1: CR Approval -> Plan Spec Creation

Source repository:

- `WebTPS-DHF`

Trigger event candidates:

- pull request review submitted
- label added
- pull request synchronized after a previously approved review

Required guard conditions:

- PR has label `pr:cr`
- PR has label `cr:new`
- PR has label `ai:ready`
- PR has human approval
- PR is not labeled `ai:blocked`

Minimum repository-dispatch payload fields for Stage 1 should include:

- `prTypeLabel: "pr:cr"`
- `crStatusLabel: "cr:new"`
- `aiControlLabel: "ai:ready"`
- `blocked: false`
- `hasHumanApproval: true`
- `approvalActor`
- `authorizedApprovers`

When cross-repository credentials are available, automation should verify these
conditions directly against the DHF PR through the GitHub API instead of
trusting payload assertions alone.

Automation action:

- read CR item
- run pre-analysis against product, roadmap, architecture, technical strategy,
  testing strategy, and AI harness
- create or update `docs/cr-specs/CRxxx-Spec.md` in `WebTPS-DHF`
- open or update a Plan Spec PR in `WebTPS-DHF`
- update CR status to `analyze`

Artifacts:

- Plan Spec PR in `WebTPS-DHF`
- comment or status note linking CR PR and Plan Spec PR

### Stage 2: Plan Approval -> Implementation PR Creation

Source repository:

- `WebTPS-DHF`

Trigger event candidates:

- pull request review submitted
- label added
- pull request synchronized after approved plan updates

Required guard conditions:

- PR has label `pr:plan`
- PR has label `cr:analyze`
- PR has label `ai:ready`
- PR has human approval
- PR is not labeled `ai:blocked`
- PR approval comes from an authorized reviewer

Automation action:

- read approved `docs/cr-specs/CRxxx-Spec.md`
- dispatch the approved plan context into `WebTPS`
- generate implementation branch or branches in `WebTPS`
- implement according to the approved plan
- update `WebTPS-DHF` when required
- open or update an Implementation PR in `WebTPS`
- update CR status to `developing`

Artifacts:

- Implementation PR in `WebTPS`
- optional linked DHF implementation PR in `WebTPS-DHF`
- comment or status note linking plan and implementation PRs

### Stage 3: Implementation Review Follow-up

Source repositories:

- `WebTPS`
- optionally `WebTPS-DHF`

Trigger event candidates:

- new PR review comment
- new issue comment on PR
- CI status change
- scheduled heartbeat for active AI-owned PRs

Required guard conditions:

- PR has label `pr:implementation`
- PR has label `cr:developing`
- PR is not labeled `ai:blocked`

Automation action:

- inspect new comments and CI failures
- triage each comment
- decide `fix now`, `do not fix`, `ask for clarification`, or `defer`
- reply to each comment
- implement fixes that stay within the approved plan
- if feedback invalidates the plan, add `ai:replan`, update plan spec, and
  return the CR to `analyze`

Artifacts:

- new commits on the implementation branch when needed
- PR replies
- optional plan spec revision PR updates

### Stage 4: Implementation Approval -> Completion

Source repositories:

- `WebTPS`
- optionally `WebTPS-DHF`

Required guard conditions:

- implementation PR has label `pr:implementation`
- implementation PR has human approval
- required CI is green
- required DHF PRs are approved or already merged
- PR is not labeled `ai:blocked`

Automation action:

- no autonomous merge by default
- mark CR as `completed` only after merge or explicit human completion action

## Comment Command Model

Comments should be used only for explicit operator commands, not for general
workflow inference.

Recommended commands:

- `/ai-run`
- `/ai-stop`
- `/ai-replan`
- `/ai-handoff`

Rules:

- commands must come from an authorized human reviewer
- commands should be translated into labels or explicit run-state updates
- free-form human comments are review input, not command input

## Heartbeat Monitoring Model

Scheduled follow-up is allowed only for active Plan Spec PRs in `WebTPS-DHF`
and active Implementation PRs in `WebTPS`.

Recommended interval:

- 1 minute for an actively reviewed PR during business-hour collaboration
- otherwise a longer interval or manual re-trigger

Rules:

- do not run heartbeat monitoring globally across all PRs
- stop monitoring when the PR is merged, closed, blocked, handed off, or idle
  by explicit human choice

## Branch Model

Recommended branches:

- CR PR: handled in `WebTPS-DHF` according to DHF repository policy
- Plan Spec PR: `codex/cr-XXX-plan` in `WebTPS-DHF`
- Implementation PR: `codex/cr-XXX-impl` in `WebTPS`

If `WebTPS-DHF` also needs a code-adjacent update during implementation:

- `codex/cr-XXX-dhf-impl`

## Cross-Repository Linking

Each stage should link to the others explicitly.

Minimum linkage:

- CR PR body links to Plan Spec PR when created
- Plan Spec PR body links to CR PR and Implementation PR when created
- Implementation PR body links to CR PR and Plan Spec PR
- DHF implementation PR, if present, links to the matching Implementation PR

## Failure Handling

### Analysis failure

If AI cannot produce a viable plan spec:

- label the CR or Plan Spec PR with `ai:needs-human`
- explain the blocker
- do not enter implementation

### Implementation failure

If AI cannot continue implementation:

- label the Implementation PR with `ai:needs-human`
- summarize the blocker
- keep the CR in `developing` unless a replan is required

### Replan condition

If implementation review invalidates the approved plan:

- add `ai:replan`
- update the Plan Spec PR
- transition the CR back to `analyze`
- do not continue implementation until the revised plan is approved

## Security And Safety Constraints

Automation must not:

- merge code without human approval
- advance stages based only on AI-generated comments
- infer approval from ambiguous natural-language comments
- bypass DHF updates when the approved plan says DHF changes are required
- continue acting on a PR labeled `ai:blocked`

## Observability Requirements

Every automation run should produce:

- trigger event
- repository and PR type
- guard conditions evaluated
- action taken
- next expected state
- failure reason when no action is taken

## Recommended Implementation Order

1. implement label conventions and PR templates
2. implement Stage 1 automation
3. implement Plan Spec PR generation
4. implement Stage 2 automation
5. implement PR follow-up heartbeat and comment triage
6. implement CR completion synchronization across repositories

## Open Questions

- how approval state is synchronized across `WebTPS` and `WebTPS-DHF`
- whether Stage 2 should open one Implementation PR or one PR per repository
- whether heartbeat monitoring lives in GitHub Actions, an external runner, or
  a thread automation model
- how authorized human operators for `/ai-*` commands are determined
