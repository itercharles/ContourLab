# CR Workflow

## Purpose

This document defines the CR-driven workflow for ContourLab. All DHF content —
CR items, requirements, risks, specs — lives in this repository under `DHF/`
and `docs/cr-specs/`.

## What you do, and when

A CR has six steps. You act at four of them; the rest is automatic. The **progress checklist** comment
on the CR's PR shows the current step and, when it is your turn, says what to do. It is edited in
place; when it becomes your turn a short new comment is added as well, because only a new comment
sends a notification.

| # | Step | Who | What happens | What you do |
|---|------|-----|--------------|-------------|
| 1 | Intake and design | automatic | You set a milestone on the issue. `CR Issue Intake` makes the CR, the `feat/CR-NNN` branch and a draft PR, then generates the design and posts its summary and the implementation plan. | Nothing. |
| 2 | Design review | **you** | The PR is at `cr:stage/design`. | Read the DHF changes and the plan. **Approve** to continue, or **Request changes** with comments to have the design revised. |
| 3 | Code and CI | automatic | `CR lifecycle` generates the code, pushes it and CI runs the full test set. | Nothing; wait for CI to be green. |
| 4 | Code review | **you** | The PR is at `cr:stage/code`. | Read the code. **Approve**, or **Request changes** with comments. A new commit dismisses an earlier approval, so approve the latest one. |
| 5 | Merge | **you** | `ready to merge` is shown. | **Squash-merge** the PR. |
| 6 | Close-out | **you** | `CR completion` opens a second PR, `chore: complete CR-NNN`, that moves the CR to `completed`. | **Merge that PR.** The CR is finished when you do. |

A failure shows as a red step in the checklist, with what failed and a link to the run.

### What the run titles in the Actions list mean

| Title | Meaning |
|-------|---------|
| `CR Issue Intake \| #N \| issue title` | Step 1 for issue #N. |
| `feat/CR-NNN · design approved` / `code approved` | Your approval was received; code generation or "ready to merge" follows. |
| `feat/CR-NNN · design changes requested` / `code changes requested` | The design or code is being revised from your comments. |
| `feat/CR-NNN · comment, nothing to do` | A plain review comment: nothing starts. |
| `feat/CR-NNN · merged, opening the close-out PR` | Step 5 done; step 6's PR is being opened. |
| `feat/CR-NNN · close-out merged, CR finished` | The last step. |
| `PR #N · not a CR, ignored` | Any other PR closing or being reviewed: the lifecycle and completion workflows start on every PR and skip the ones that are not CRs. These rows are expected noise. |
| `CI · PR #N · title`, `CI · push to <branch>` | The product CI/CD pipeline. |

## Sources of Truth

- `DHF/items/` — CR lifecycle, requirement/risk/design items
- `docs/cr-specs/` — CR specification documents
- `.github/workflows/issue-to-cr.yml` — CR intake from GitHub issues
- `.github/workflows/cr-lifecycle.yml` — design review and implementation stages
- `.github/workflows/cr-complete.yml` — CR completion on PR merge

## PR Topology

One `feat/CR-NNN` Draft PR carries both stages. Branch and PR are opened at
intake (with design already generated) and stay open until the implementation
is approved and merged.

```
feat/CR-NNN  ──commit: CR + design──▶  commit: implementation ──▶  merge
                   (intake)                  (gen-code)
                       │                          │
                  cr:stage/design            cr:stage/code
```

Stage position is tracked by a `cr:stage/*` label on the PR:

| Label | Stage |
|-------|-------|
| `cr:stage/design` | AI-generated DHF design awaiting review |
| `cr:stage/code` | AI-generated implementation awaiting code review |

## Stage Flow

### Intake

- Trigger: GitHub issue milestone set (issue owner only)
- Workflow: `issue-to-cr.yml`
- Steps:
  1. CR YAML created in `DHF/items/09_cr/`; pushed to `feat/CR-NNN` branch
  2. Draft PR opened with `cr:stage/design` label
  3. DHF design items generated immediately (no separate design-review step to wait for)
  4. Design committed; design summary and implementation plan posted as PR comments
- If design generation fails: re-trigger via workflow_dispatch (stage: `design`)

### Stage 1 — Design Review → Implementation

- Trigger: reviewer **approves** PR at `cr:stage/design`
- Workflow: `cr-lifecycle.yml` (`gen-code` job)
- Steps:
  1. `develop-cr` generates implementation code
  2. Implementation committed; label rotated to `cr:stage/code`; PR converted to ready
  3. CI pipeline watched — if it fails, a comment is posted and the job exits non-zero
- If `changes_requested`: `revise-design` re-runs `generate-dhf` and pushes; re-approve to continue

### Stage 2 — Code Review → Merge

- Trigger: reviewer **approves** PR at `cr:stage/code`
- Workflow: `cr-lifecycle.yml` (`code-approved` job)
- Output: the progress checklist moves to step 5 ("Merge this PR") and a notification comment is added; human merges the PR
- If `changes_requested`: `revise-code` re-runs `develop-cr` and pushes; re-approve to continue

### Post-Merge

- Workflow: `cr-complete.yml`
- Steps:
  1. CR transitioned to `completed` in `DHF/items/09_cr/`
  2. Closure gate checks DHF traceability completeness and test evidence
  3. CI pipeline triggered on main (squash merges can inherit `[skip ci]` from lifecycle commits)
  4. The CR's progress checklist moves to step 6 and links the close-out PR; when that PR is merged
     (`close-out-merged` job) the checklist shows the CR as complete

### Cancel

- Trigger: PR closed without merging (any stage)
- Workflow: `cr-lifecycle.yml`
- Output: CR YAML checked out from main, transitioned to `cancelled`, committed and pushed

## State Model

| State | Meaning |
|-------|---------|
| `draft` | CR created, not yet submitted |
| `in_review` | Draft PR open, design/code under review |
| `completed` | Implementation merged; DHF closed out |
| `cancelled` | PR closed without merging |

Normal flow: `draft → in_review → completed`

## Manual Re-run

If a stage gets stuck (Claude timeout, runner failure), re-trigger via:

**Actions → cr-lifecycle → Run workflow**

Inputs:
- `cr_id`: e.g. `CR-034`
- `stage`:
  - `design` — re-runs implementation generation (`gen-code`)
  - `code` — marks code as approved

## Runtime Prerequisites

Workflows use `GITHUB_TOKEN` for read operations and `ACTIONS_PAT` (a PAT with
`contents:write` and `pull-requests:write`) for commits that need to trigger
downstream CI.

Repository variables:
- `CR_DESIGN_MODEL` — Claude model for DHF design generation
- `CR_DEVELOP_MODEL` — Claude model for implementation

Secrets:
- `ANTHROPIC_API_KEY`
- `ACTIONS_PAT`
